/**
 * 4DGS Deformation Web Worker — E4
 * =================================
 * 在 Web Worker 中运行 ONNX 推理，计算任意时间 t 的变形 delta。
 * 
 * Messages:
 *   {type: 'init', onnxUrl: string}           → 加载 ONNX 模型
 *   {type: 'infer', time: number, xyz: Float32Array}  → 推理
 *   
 * Responses:
 *   {type: 'ready'}                           → 模型加载完成
 *   {type: 'result', time, dx, ds, dr, do, dsh}  → 推理结果
 *   {type: 'error', message}                  → 错误
 */

importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.min.js');

let session = null;

self.onmessage = async function(e) {
  const msg = e.data;
  
  if (msg.type === 'init') {
    try {
      ort.env.wasm.numThreads = 1;
      session = await ort.InferenceSession.create(msg.onnxUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: 'Init failed: ' + err.message });
    }
  }
  
  if (msg.type === 'infer' && session) {
    try {
      const N = msg.xyz.length / 3;
      const timeArr = new Float32Array(N);
      timeArr.fill(msg.time);
      
      const xyzTensor = new ort.Tensor('float32', msg.xyz, [N, 3]);
      const timeTensor = new ort.Tensor('float32', timeArr.buffer ? new Float32Array(N * 1) : timeArr, [N, 1]);
      // Fill time tensor
      for (let i = 0; i < N; i++) timeTensor.data[i] = msg.time;
      
      const results = await session.run({ xyz: xyzTensor, time: timeTensor });
      
      self.postMessage({
        type: 'result',
        time: msg.time,
        dx: results.dx.data,
        ds: results.ds.data,
        dr: results.dr.data,
        do: results.do.data,
        dsh: results.dsh.data,
      }, [
        results.dx.data.buffer,
        results.ds.data.buffer,
        results.dr.data.buffer,
        results.do.data.buffer,
        results.dsh.data.buffer,
      ]);
    } catch (err) {
      self.postMessage({ type: 'error', message: 'Infer failed: ' + err.message });
    }
  }
};
