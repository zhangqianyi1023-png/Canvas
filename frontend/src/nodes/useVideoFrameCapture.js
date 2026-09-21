import { useCallback, useState } from 'react';
import { useReactFlow } from 'reactflow';
import {
  VIDEO_FRAME_ACTIONS,
  buildVideoFrameResultNode,
  captureAndUploadVideoFrame,
} from '../videoFrameCapture.js';

export function useVideoFrameCapture({ sourceNodeId, getVideoElement, sourceVideoUrl = '' }) {
  const { getNode, setNodes } = useReactFlow();
  const showAlert = useCallback(async (message) => {
    window.alert(message);
  }, []);
  const [capturingKind, setCapturingKind] = useState('');
  const [progress, setProgress] = useState(0);

  const captureFrameAsset = useCallback(async (kind) => {
    if (capturingKind) return null;
    const video = getVideoElement?.();
    if (!video) {
      await showAlert('视频尚未加载完成，请稍后重试');
      return null;
    }
    setCapturingKind(kind);
    setProgress(0);
    try {
      const capture = await captureAndUploadVideoFrame(video, kind, { onProgress: setProgress });
      return capture;
    } catch (error) {
      await showAlert(error?.message || '视频截帧失败，请重试');
      return null;
    } finally {
      setCapturingKind('');
      setProgress(0);
    }
  }, [capturingKind, getVideoElement, showAlert]);

  const captureFrame = useCallback(async (kind) => {
    const capture = await captureFrameAsset(kind);
    if (!capture) return null;
    try {
      const sourceNode = getNode(sourceNodeId);
      if (!sourceNode) throw new Error('来源视频节点已不存在');
      const resultNode = buildVideoFrameResultNode({
        sourceNode,
        capture: { ...capture, sourceVideoUrl },
        offsetIndex: Math.max(0, VIDEO_FRAME_ACTIONS.findIndex(action => action.id === kind)),
      });
      resultNode.data = {
        ...resultNode.data,
        onDeleteNode: sourceNode.data?.onDeleteNode,
        onInteractiveDragCreate: sourceNode.data?.onInteractiveDragCreate,
        onNodeResize: sourceNode.data?.onNodeResize,
      };
      setNodes(nodes => [
        ...nodes.map(node => ({ ...node, selected: false })),
        resultNode,
      ]);
      return { capture, resultNode };
    } catch (error) {
      await showAlert(error?.message || '视频截帧失败，请重试');
      return null;
    }
  }, [captureFrameAsset, getNode, setNodes, showAlert, sourceNodeId, sourceVideoUrl]);

  return { captureFrame, captureFrameAsset, capturingKind, progress };
}
