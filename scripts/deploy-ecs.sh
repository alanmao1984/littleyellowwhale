#!/usr/bin/env bash
set -Eeuo pipefail

SHA="${1:-}"
RELEASE_DIR="${2:-$(pwd)}"
APP_DIR="${APP_DIR:-/opt/littleyellowwhale}"
SHARED_DIR="$APP_DIR/shared"
STATE_FILE="$SHARED_DIR/deploy.env"
ACTIVE_SLOT_FILE="$SHARED_DIR/active-slot"
UPSTREAM_FILE="$SHARED_DIR/nginx-upstream.conf"
COMPOSE_FILE="$RELEASE_DIR/deploy/compose.yaml"
RUNTIME_ENV="$SHARED_DIR/.env.production"
IMAGE="littleyellowwhale:$SHA"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character Git commit SHA is required." >&2
  exit 64
fi

for command in docker curl; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 69; }
done
docker compose version >/dev/null
[[ -f "$COMPOSE_FILE" ]] || { echo "Compose file not found: $COMPOSE_FILE" >&2; exit 66; }
[[ -f "$RUNTIME_ENV" ]] || { echo "Runtime environment file not found: $RUNTIME_ENV" >&2; exit 78; }

touch "$STATE_FILE"
chmod 600 "$STATE_FILE" "$RUNTIME_ENV"
active_slot="$(cat "$ACTIVE_SLOT_FILE" 2>/dev/null || true)"
if [[ "$active_slot" == "blue" ]]; then
  target_slot="green"
  target_port=3002
else
  target_slot="blue"
  target_port=3001
fi

blue_image="$(sed -n 's/^BLUE_IMAGE=//p' "$STATE_FILE" | tail -n 1)"
blue_sha="$(sed -n 's/^BLUE_SHA=//p' "$STATE_FILE" | tail -n 1)"
green_image="$(sed -n 's/^GREEN_IMAGE=//p' "$STATE_FILE" | tail -n 1)"
green_sha="$(sed -n 's/^GREEN_SHA=//p' "$STATE_FILE" | tail -n 1)"
blue_image="${blue_image:-littleyellowwhale:bootstrap}"
blue_sha="${blue_sha:-unknown}"
green_image="${green_image:-littleyellowwhale:bootstrap}"
green_sha="${green_sha:-unknown}"

turnstile_site_key="$(sed -n 's/^NEXT_PUBLIC_TURNSTILE_SITE_KEY=//p' "$RUNTIME_ENV" | tail -n 1)"
actions_key="$(sed -n 's/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=//p' "$RUNTIME_ENV" | tail -n 1)"
[[ -n "$turnstile_site_key" ]] || { echo "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required." >&2; exit 78; }
[[ -n "$actions_key" ]] || { echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required." >&2; exit 78; }

# ECS 出口到部分 Cloudflare anycast 网段被黑洞，challenges.cloudflare.com 的默认解析会超时，
# Turnstile 服务端校验（better-auth captcha 插件，地址硬编码）因此失败。每次部署探测一个
# 可用节点注入容器 /etc/hosts；优先使用显式配置的 TURNSTILE_RESOLVE_IP。
turnstile_resolve_ip() {
  local preferred candidate
  preferred="$(sed -n 's/^TURNSTILE_RESOLVE_IP=//p' "$RUNTIME_ENV" | tail -n 1)"
  for candidate in ${preferred:+$preferred} 172.64.80.1 104.26.10.1 104.21.59.25 162.159.140.1 188.114.96.1; do
    if curl --silent --show-error --max-time 5 -o /dev/null \
        --resolve "challenges.cloudflare.com:443:$candidate" \
        https://challenges.cloudflare.com/turnstile/v0/siteverify; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  printf '%s' "${preferred:-172.64.80.1}"
}
export TURNSTILE_RESOLVE_IP="$(turnstile_resolve_ip)"
echo "Turnstile siteverify 出口节点: $TURNSTILE_RESOLVE_IP"

actions_key_file="$(mktemp "$SHARED_DIR/actions-key.XXXXXX")"
trap 'rm -f "$actions_key_file"' EXIT
chmod 600 "$actions_key_file"
printf '%s' "$actions_key" > "$actions_key_file"

# 构建前腾内存：这台 4GB 实例曾因 docker build 耗尽内存触发 OOM，把系统拖到
# 假死（SSH 与云助手两条救援通道同时失联，最后只能重启实例）。先回收 page cache，
# 再等可用内存到位（构建峰值通常需要 1GB+ 余量），避免把同机的其他站点拖下水。
sync
if [[ -w /proc/sys/vm/drop_caches ]]; then
  echo 1 > /proc/sys/vm/drop_caches 2>/dev/null || true
fi
avail_mb="$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)"
for attempt in $(seq 1 30); do
  if [[ "${avail_mb:-0}" -ge 1200 ]]; then break; fi
  echo "可用内存仅 ${avail_mb}MB，等待其他任务让出内存（$attempt/30）"
  sleep 10
  avail_mb="$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)"
done
echo "构建前可用内存: ${avail_mb}MB"

echo "Building revision $SHA for the $target_slot slot."
docker build \
  --secret "id=next_server_actions_encryption_key,src=$actions_key_file" \
  --build-arg "BUILD_SHA=$SHA" \
  --build-arg "NEXT_PUBLIC_TURNSTILE_SITE_KEY=$turnstile_site_key" \
  --label com.xiaohuangjing.service=web \
  --label "org.opencontainers.image.revision=$SHA" \
  --tag "$IMAGE" \
  "$RELEASE_DIR"
rm -f "$actions_key_file"
trap - EXIT

if [[ "$target_slot" == "blue" ]]; then
  blue_image="$IMAGE"
  blue_sha="$SHA"
else
  green_image="$IMAGE"
  green_sha="$SHA"
fi

state_tmp="$(mktemp "$SHARED_DIR/deploy.env.XXXXXX")"
cat > "$state_tmp" <<EOF
BLUE_IMAGE=$blue_image
BLUE_SHA=$blue_sha
GREEN_IMAGE=$green_image
GREEN_SHA=$green_sha
EOF
chmod 600 "$state_tmp"
mv "$state_tmp" "$STATE_FILE"

docker compose --env-file "$STATE_FILE" -f "$COMPOSE_FILE" up -d --no-deps "$target_slot"

health_url="http://127.0.0.1:$target_port/api/status"
healthy=false
for attempt in $(seq 1 45); do
  response="$(curl --silent --show-error --fail --max-time 5 --header 'Host: xiaohuangjing.com' "$health_url" 2>/dev/null || true)"
  if [[ "$response" == *'"status":"ready"'* && "$response" == *"\"revision\":\"$SHA\""* && "$response" == *'"role":"primary"'* ]]; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  echo "Candidate $target_slot failed its health check; the active slot was not changed." >&2
  docker compose --env-file "$STATE_FILE" -f "$COMPOSE_FILE" stop "$target_slot" >/dev/null || true
  exit 1
fi

upstream_tmp="$(mktemp "$SHARED_DIR/nginx-upstream.conf.XXXXXX")"
cat > "$upstream_tmp" <<EOF
upstream littleyellowwhale_app {
    server 127.0.0.1:$target_port;
    keepalive 32;
}
EOF
chmod 644 "$upstream_tmp"
mv "$upstream_tmp" "$UPSTREAM_FILE"

sudo nginx -t
sudo systemctl reload nginx
printf '%s\n' "$target_slot" > "$ACTIVE_SLOT_FILE"

echo "Revision $SHA is active in the $target_slot slot on port $target_port."

docker image ls --filter label=com.xiaohuangjing.service=web --format '{{.ID}}' \
  | awk '!seen[$0]++' \
  | tail -n +7 \
  | xargs --no-run-if-empty docker image rm >/dev/null 2>&1 || true

find "$APP_DIR/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -rn \
  | tail -n +8 \
  | cut -d' ' -f2- \
  | xargs --no-run-if-empty rm -rf --
