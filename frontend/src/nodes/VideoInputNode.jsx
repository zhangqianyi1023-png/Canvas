// ===== 输入节点：视频节点 =====
// nodeType === 'videoInput'
import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import InteractiveHandle from './InteractiveHandle';
import NodeHoverToolbar from './NodeHoverToolbar';
import EditableNodeTitle from './EditableNodeTitle';
import Icon from '../components/Icon';
import {
  SUPPORTED_VIDEO_ACCEPT,
  SUPPORTED_VIDEO_LABEL,
  getUnsupportedVideoMessage,
  isSupportedVideoFile,
} from '../videoFormats';
import { uploadVideoFile } from '../uploadVideo';

function VideoInputNode({ id, data, selected }) {
  const initialVideos = data?.videoUrls || (data?.videoUrl ? [data.videoUrl] : []);
  const [videos, setVideos] = useState(initialVideos);
  const [uploads, setUploads] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [isHovering, setIsHovering] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const fileInputRef = useRef(null);
  const onVideosChange = data?.onVideosChange;
  const onUpdateOutputs = data?.onUpdateOutputs;
  const title = data?.label || '视频';
  const isMultiSelected = Boolean(data?.isMultiSelected);

  useEffect(() => {
    if (onVideosChange) {
      onVideosChange(id, videos);
    }
    if (onUpdateOutputs) {
      onUpdateOutputs(id, { video_urls: videos });
    }
  }, [id, videos, onVideosChange, onUpdateOutputs]);

  const updateVideos = useCallback((nextVideos) => {
    setVideos(nextVideos);
  }, []);

  const appendVideo = useCallback((videoUrl) => {
    setVideos(prev => [...prev, videoUrl]);
  }, []);

  const createUploadPreview = (file) => ({
    id: `${file.name}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    progress: 0,
    error: '',
  });

  const uploadFiles = useCallback((files) => {
    const allFiles = Array.from(files || []);
    const videoFiles = allFiles.filter(isSupportedVideoFile);
    const unsupportedCount = allFiles.filter(file => file.type.startsWith('video/') && !isSupportedVideoFile(file)).length;
    setUploadError(unsupportedCount > 0 ? getUnsupportedVideoMessage(unsupportedCount) : '');
    if (videoFiles.length === 0) return;

    const queuedUploads = videoFiles.map(createUploadPreview);
    setUploads(prev => [...prev, ...queuedUploads]);

    videoFiles.forEach((file, index) => {
      const uploadId = queuedUploads[index].id;
      uploadVideoFile(file, (progress) => {
        setUploads(prev => prev.map(item => (
          item.id === uploadId ? { ...item, progress } : item
        )));
      }).then((asset) => {
        appendVideo(asset.url);
        setUploads(prev => prev.filter(item => {
          if (item.id === uploadId) URL.revokeObjectURL(item.previewUrl);
          return item.id !== uploadId;
        }));
      }).catch((error) => {
        setUploads(prev => prev.map(item => (
          item.id === uploadId ? { ...item, error: error.message || '上传失败' } : item
        )));
      });
    });
  }, [appendVideo]);

  const handleUpload = useCallback((e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  }, [uploadFiles]);

  const handleVideoMetadata = useCallback((event) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth > 0 && videoHeight > 0) {
      data?.onVideoAspectChange?.(id, videoWidth / videoHeight);
    }
  }, [data, id]);

  const removeVideo = useCallback((index) => {
    updateVideos(videos.filter((_, i) => i !== index));
  }, [videos, updateVideos]);

  const clearVideos = useCallback(() => {
    updateVideos([]);
  }, [updateVideos]);

  const hasMedia = videos.length > 0 || uploads.length > 0;
  const showSelectedToolbar = !isMultiSelected
    && !isTitleEditing
    && selected;

  return (
    <div
      className={`custom-node video-node media-input-node ${hasMedia ? 'has-media' : ''} ${selected ? 'selected' : ''}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {hasMedia && (
        <NodeResizer
          isVisible={!isMultiSelected && (selected || isHovering)}
          minWidth={180}
          minHeight={130}
          keepAspectRatio
          handleClassName="canvas-node-resize-handle"
          lineClassName="canvas-node-resize-line"
          onResizeEnd={(_, params) => data?.onNodeResize?.(id, { width: params.width, height: params.height })}
        />
      )}
      <Handle type="target" position={Position.Left} style={{ background: 'var(--accent)' }} />
      <InteractiveHandle side="left" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />

      <div className="node-header">
        <EditableNodeTitle
          icon={<Icon name="videoGenFill" size={16} />}
          value={title}
          fallback="视频"
          tagColors={data?.tagColors}
          onChange={(nextLabel) => data?.onNodeTitleChange?.(id, nextLabel)}
          onEditingChange={setIsTitleEditing}
        />
        <span className="category">输入</span>
      </div>

      <div className="node-body">
        {hasMedia ? (
          <>
            <div className="video-list">
              {videos.map((src, index) => (
                <div className="video-thumb" key={`${src.slice(0, 32)}_${index}`}>
                  <video src={src} controls muted playsInline onLoadedMetadata={handleVideoMetadata} />
                  <button
                    className="thumb-remove"
                    onClick={() => removeVideo(index)}
                    aria-label="删除视频"
                  >
                    <Icon name="x" size={13} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
              {uploads.map(item => (
                <div className="video-thumb uploading" key={item.id}>
                  <video src={item.previewUrl} muted playsInline />
                  <div className="upload-progress-overlay">
                    <div className="upload-progress-bar">
                      <span style={{ width: `${item.progress}%` }} />
                    </div>
                    <strong>{item.error ? '上传失败' : `${item.progress}%`}</strong>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="image-upload-zone">
            <button
              type="button"
              className="upload-zone-trigger nodrag"
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span style={{ marginBottom: '6px', display: 'inline-flex', color: 'currentColor' }}>
                <Icon name="videoGenFill" size={24} />
              </span>
              <span>点击上传视频</span>
            </button>
            <div style={{ fontSize: 'var(--fs-xs)', marginTop: '4px' }}>支持 {SUPPORTED_VIDEO_LABEL}</div>
          </div>
        )}
        {uploadError && <div className="upload-format-error">{uploadError}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_VIDEO_ACCEPT}
          multiple
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--success-alt)' }} />
      <InteractiveHandle side="right" nodeId={id} onDragCreate={data?.onInteractiveDragCreate} />
      <NodeHoverToolbar
        hidden={!showSelectedToolbar}
        portal
        forceVisible={showSelectedToolbar}
        tagColors={data?.tagColors}
        onTagToggle={(colorId) => data?.onNodeTagToggle?.(id, colorId)}
        actions={[
          {
            id: 'upload-more',
            label: hasMedia ? '继续上传' : '上传视频',
            title: hasMedia ? '继续上传视频' : '上传视频',
            icon: 'upload',
            onClick: () => fileInputRef.current?.click(),
          },
          ...(videos.length > 0 ? [{
            id: 'download-videos',
            label: '下载视频',
            title: '下载视频',
            icon: 'save',
            onClick: () => data?.onDownloadVideo?.(id),
          }] : []),
          ...(videos.length > 0 || uploads.length > 0 ? [{
            id: 'clear-videos',
            label: '清空',
            title: '清空视频',
            icon: 'x',
            onClick: clearVideos,
          }] : []),
        ]}
      />
    </div>
  );
}

export default memo(VideoInputNode);
