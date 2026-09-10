import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, mkdir, symlink, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { approvedRoot, confinedPath, videoPaths, downloadMedia, approveTemplate, prepareApprovedPrompt } from '../packages/venus-node/src/media-security.ts'
import { adapterCapabilities, executeMedia, processRun } from '../packages/venus-node/src/adapters.ts'
import { retryClaim } from '../packages/venus-node/src/runtime.ts'
import { heartbeatSchema, readPolicy, supportsWork } from '../packages/node-protocol/index.ts'

test('旧节点与默认会话仅允许文本，不从模型名推断媒体能力', async () => {
  assert.deepEqual(heartbeatSchema.parse({ models: ['comfyui'] }).capabilities, ['text:infer'])
  assert.equal(supportsWork(readPolicy(null).allowedCapabilities, 'video', 'segment'), false)
  const config = { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434' }
  assert.deepEqual(adapterCapabilities(config), ['text:infer'])
  await assert.rejects(executeMedia(config, { taskType: 'video', operation: 'segment' }, new AbortController().signal), /未授权/)
})
test('输入输出拒绝目录穿越、符号链接、覆盖和间接远程输入，采用独立 attempt 目录', async () => {
  const root = await approvedRoot(await mkdtemp(join(tmpdir(), 'venus-media-test-')))
  try {
    await mkdir(join(root, 'input')); await mkdir(join(root, 'output')); await mkdir(join(root, 'outside'))
    const policy = { inputRoot: join(root, 'input'), outputRoot: join(root, 'output'), capabilities: ['video:segment'] }
    const input = join(policy.inputRoot, 'input.mp4'); const output = join(policy.outputRoot, 'out.mp4')
    await writeFile(input, Buffer.from([0,0,0,16,102,116,121,112,109,112,52,50,0,0,0,0]))
    const one = await videoPaths(policy, input, output, 'mp4', randomUUID())
    const two = await videoPaths(policy, input, output, 'mp4', randomUUID())
    assert.notEqual(one.directory, two.directory)
    await assert.rejects(confinedPath(policy.inputRoot, join(root, 'outside'), 'directory'), /越过/)
    await symlink(join(root, 'outside'), join(policy.inputRoot, 'escape'))
    await assert.rejects(confinedPath(policy.inputRoot, join(policy.inputRoot, 'escape'), 'directory'), /符号链接/)
    await writeFile(output, 'existing'); await assert.rejects(videoPaths(policy, input, output, 'mp4', randomUUID()), /覆盖/)
    await assert.rejects(videoPaths(policy, input, input, 'mp4', randomUUID()), /不能相同/)
    await writeFile(join(policy.inputRoot, 'playlist.mp4'), '#EXTM3U\nhttp://169.254.169.254/')
    await assert.rejects(videoPaths(policy, join(policy.inputRoot, 'playlist.mp4'), join(policy.outputRoot, 'new.mp4'), 'mp4', randomUUID()), /文件头/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('下载边读边限长、超限取消并清理、已有文件不覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'venus-stream-test-'))
  try {
    let cancelled = false
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)) }, cancel() { cancelled = true } })
    const output = join(root, 'too-large.png')
    await assert.rejects(downloadMedia(new Response(stream), output, { remaining: 10 }), /上限/)
    assert.equal(cancelled, true); await assert.rejects(stat(output), { code: 'ENOENT' })
    const ok = join(root, 'ok.png')
    assert.equal(await downloadMedia(new Response(new Uint8Array([1,2,3])), ok, { remaining: 10 }), 3)
    await assert.rejects(downloadMedia(new Response('overwrite'), ok, { remaining: 10 }), { code: 'EEXIST' })
    assert.deepEqual([...await readFile(ok)], [1,2,3])
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('ComfyUI 只替换本地批准映射，拒绝未知模板与节点类', () => {
  const source = { workflow: { '1': { class_type: 'ApprovedNode', inputs: { text: 'original', seed: 1, width: 512, height: 512, untouched: 'same' } } }, allowedClasses: ['ApprovedNode'], inputs: { prompt: { node: '1', key: 'text' }, seed: { node: '1', key: 'seed' }, width: { node: '1', key: 'width' }, height: { node: '1', key: 'height' } } }
  const template = approveTemplate(source)
  const work = { mediaSpec: { taskType: 'image', comfyWorkflow: source.workflow } }
  const prompt = prepareApprovedPrompt(template, work, { prompt: 'new', width: 1024, height: 768, seed: 2 })
  assert.equal(prompt['1'].inputs.text, 'new'); assert.equal(prompt['1'].inputs.width, 1024); assert.equal(prompt['1'].inputs.untouched, 'same'); assert.equal(source.workflow['1'].inputs.text, 'original')
  assert.throws(() => approveTemplate({ ...source, allowedClasses: ['Different'] }), /未批准/)
  assert.throws(() => prepareApprovedPrompt(template, { mediaSpec: { taskType: 'image', comfyWorkflow: {} } }, { prompt: 'bad' }), /未获本地批准/)
})
test('ComfyUI 输出目录先授权，文件数超限不成功并清理已下载文件', async t => {
  const root = await approvedRoot(await mkdtemp(join(tmpdir(), 'venus-comfy-test-')))
  const source = { workflow: { '1': { class_type: 'ApprovedNode', inputs: { text: 'original', seed: 1, width: 512, height: 512 } } }, allowedClasses: ['ApprovedNode'], inputs: { prompt: { node: '1', key: 'text' }, seed: { node: '1', key: 'seed' }, width: { node: '1', key: 'width' }, height: { node: '1', key: 'height' } } }
  let calls = 0
  t.mock.method(globalThis, 'fetch', async url => {
    calls++
    if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'owned-prompt' })
    if (url.includes('/history/')) return Response.json({ 'owned-prompt': { outputs: { '1': { images: Array.from({ length: 5 }, (_, index) => ({ filename: `image-${index}.png`, type: 'output', subfolder: '' })) } } } })
    return new Response(new Uint8Array([1, 2, 3]))
  })
  const config = { provider: 'comfyui', baseUrl: 'http://127.0.0.1:8188', media: { inputRoot: root, outputRoot: root, capabilities: ['image:multi_shot'], template: approveTemplate(source) } }
  const work = { attemptId: randomUUID(), taskId: randomUUID(), taskType: 'image', operation: 'multi_shot', billingUnits: 1, mediaSpec: { taskType: 'image', operation: 'multi_shot', comfyWorkflow: source.workflow, timeoutSeconds: 30 }, input: JSON.stringify({ prompt: 'test', outputDir: tmpdir() }) }
  try {
    await assert.rejects(executeMedia(config, work, new AbortController().signal), /越过/)
    assert.equal(calls, 0)
    await assert.rejects(executeMedia(config, { ...work, input: JSON.stringify({ prompt: 'test', outputDir: root }) }, new AbortController().signal), /数量超限/)
    const { readdir } = await import('node:fs/promises')
    assert.deepEqual(await readdir(root), [])
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('已中止不启动进程；中止后确认子进程退出', async () => {
  const stopped = AbortSignal.abort()
  assert.throws(() => processRun('command-that-must-not-start', [], stopped))
  const controller = new AbortController()
  const promise = processRun(process.execPath, ['-e', 'setInterval(()=>{},1000)'], controller.signal)
  setTimeout(() => controller.abort(), 100)
  await assert.rejects(promise, /未确认成功/)
})
test('领取响应丢失重用同一闭包，仅重试三次，不执行任务', async () => {
  let count = 0
  const response = await retryClaim(async () => { count++; if (count < 3) throw new Error('lost'); return { assignment: null } }, new AbortController().signal)
  assert.equal(count, 3); assert.equal(response.assignment, null)
})
