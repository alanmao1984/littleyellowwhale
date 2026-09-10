import test from 'node:test'
import assert from 'node:assert/strict'
import { remotePrivateVideoItemSchema } from '../packages/node-protocol/index.ts'
import { canOrganization } from '../lib/venus/authorization.ts'

const remoteVideo = {
  kind: 'remote_private_media',
  assetId: '32c063c7-edc2-4f54-a128-fcd38f6cde73',
  template: 'compress_mp4',
  contentType: 'video/mp4',
  sha256: 'a'.repeat(64),
  byteSize: 1024,
}

test('组织角色矩阵拒绝界面外的权限提升', () => {
  assert.equal(canOrganization('owner', 'manage_members'), true)
  assert.equal(canOrganization('admin', 'manage_structure'), true)
  assert.equal(canOrganization('operator', 'manage_members'), false)
  assert.equal(canOrganization('member', 'manage_nodes'), false)
  assert.equal(canOrganization('member', 'submit_task'), true)
})

test('私有视频协议只接受固定模板、有界大小与 SHA-256', () => {
  assert.equal(remotePrivateVideoItemSchema.safeParse(remoteVideo).success, true)
  assert.equal(remotePrivateVideoItemSchema.safeParse({ ...remoteVideo, template: '-i http://example.com/x' }).success, false)
  assert.equal(remotePrivateVideoItemSchema.safeParse({ ...remoteVideo, sha256: 'bad' }).success, false)
  assert.equal(remotePrivateVideoItemSchema.safeParse({ ...remoteVideo, byteSize: 250 * 1024 * 1024 + 1 }).success, false)
  assert.equal(remotePrivateVideoItemSchema.safeParse({ ...remoteVideo, shell: true }).success, false)
})
