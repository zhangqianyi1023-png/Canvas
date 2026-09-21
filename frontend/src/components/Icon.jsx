import {
  RiAddLine,
  RiAedFill,
  RiAiGenerateText,
  RiAnticlockwiseLine,
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiAppsLine,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowRightUpLine,
  RiArrowUpLine,
  RiAttachment2,
  RiBarChartBoxAiFill,
  RiBookAiFill,
  RiChatAi3Line,
  RiCheckLine,
  RiCertificateFill,
  RiClapperboardFill,
  RiCircleFill,
  RiCircleLine,
  RiClockwiseLine,
  RiCloseLine,
  RiCompass3Line,
  RiCropLine,
  RiCursorLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiEditLine,
  RiEraserLine,
  RiCollapseDiagonalLine,
  RiExpandDiagonalLine,
  RiFileCopyLine,
  RiFileImageFill,
  RiFileList2Fill,
  RiFileTextLine,
  RiFileUserFill,
  RiFileVideoFill,
  RiFocus3Line,
  RiFolderLine,
  RiFullscreenLine,
  RiGridFill,
  RiImageAddLine,
  RiImageAiFill,
  RiImageAiLine,
  RiImageLine,
  RiListView,
  RiLayoutGridFill,
  RiLoader4Line,
  RiMessageAi3Fill,
  RiMicLine,
  RiMoonLine,
  RiMoreLine,
  RiMvFill,
  RiPaletteLine,
  RiPauseFill,
  RiPlayLine,
  RiQuestionLine,
  RiQuoteText,
  RiRefreshLine,
  RiSaveLine,
  RiScissorsCutLine,
  RiSearchLine,
  RiSettingsLine,
  RiShoppingBagLine,
  RiSquareFill,
  RiStackLine,
  RiStackshareFill,
  RiStopFill,
  RiSubtractLine,
  RiSunLine,
  RiTableFill,
  RiText,
  RiUploadLine,
  RiVideoLine,
  RiVolumeUpLine,
  RiZoomInLine,
  RiZoomOutLine,
} from '@remixicon/react';

const iconMap = {
  x: RiCloseLine,
  image: RiImageLine,
  imageAdd: RiImageAddLine,
  connector: ({ size, className, ...props }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M21 17C21 19.2091 19.2091 21 17 21C14.7909 21 13 19.2091 13 17C13 14.7909 14.7909 13 17 13C19.2091 13 21 14.7909 21 17ZM11 7C11 9.20914 9.20914 11 7 11C4.79086 11 3 9.20914 3 7C3 4.79086 4.79086 3 7 3C9.20914 3 11 4.79086 11 7ZM21 7C21 9.20914 19.2091 11 17 11C16.2584 11 15.5634 10.7972 14.9678 10.4453L10.4453 14.9678C10.7972 15.5634 11 16.2584 11 17C11 19.2091 9.20914 21 7 21C4.79086 21 3 19.2091 3 17C3 14.7909 4.79086 13 7 13C7.74116 13 8.43593 13.2022 9.03125 13.5537L13.5537 9.03125C13.2022 8.43593 13 7.74116 13 7C13 4.79086 14.7909 3 17 3C19.2091 3 21 4.79086 21 7Z" />
    </svg>
  ),
  copy: RiFileCopyLine,
  trash: RiDeleteBinLine,
  layers: RiStackLine,
  edit: RiEditLine,
  add: RiAddLine,
  aiGenerateText: RiAiGenerateText,
  settings: RiSettingsLine,
  shoppingBag: RiShoppingBagLine,
  messageAi3: RiMessageAi3Fill,
  mic: RiMicLine,
  more: RiMoreLine,
  movieAi: RiClapperboardFill,
  audioGenFill: RiMvFill,
  video: RiVideoLine,
  videoGenFill: RiFileVideoFill,
  folder: RiFolderLine,
  fileText: RiFileTextLine,
  briefcase: RiChatAi3Line,
  save: RiSaveLine,
  download: RiDownloadLine,
  search: RiSearchLine,
  check: RiCheckLine,
  certificate: RiCertificateFill,
  smartSplitter: RiStackshareFill,
  arrowLeft: RiArrowLeftLine,
  arrowRightUp: RiArrowRightUpLine,
  arrowUp: RiArrowUpLine,
  attachment: RiAttachment2,
  barChartBoxAi: RiBarChartBoxAiFill,
  storyboardWorkbench: RiTableFill,
  inputMethodFill: RiFileList2Fill,
  text: RiText,
  quoteText: RiQuoteText,
  play: RiPlayLine,
  pause: RiPauseFill,
  stop: RiStopFill,
  split: RiScissorsCutLine,
  imageGen: RiImageAiLine,
  imageGenFill: RiFileImageFill,
  help: RiQuestionLine,
  loader: RiLoader4Line,
  refresh: RiRefreshLine,
  upload: RiUploadLine,
  user: RiFileUserFill,
  chevronDown: RiArrowDownSLine,
  batch: RiListView,
  undo: RiArrowGoBackLine,
  redo: RiArrowGoForwardLine,
  focus: RiFocus3Line,
  fullscreen: RiFullscreenLine,
  collapseDiagonal: RiCollapseDiagonalLine,
  expandDiagonal: RiExpandDiagonalLine,
  compass: RiCompass3Line,
  circle: RiCircleFill,
  circleOutline: RiCircleLine,
  crop: RiCropLine,
  cursor: RiCursorLine,
  rotateLeft: RiAnticlockwiseLine,
  rotateRight: RiClockwiseLine,
  aed: RiAedFill,
  grid: RiGridFill,
  square: RiSquareFill,
  magnet: RiLayoutGridFill,
  magnetLock: ({ size, className, ...props }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M6.5 4.75h3.25v7.25a2.25 2.25 0 0 0 4.5 0V4.75h3.25V12a5.5 5.5 0 0 1-11 0V4.75Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6.5 8h3.25M14.25 8h3.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="9" y="15" width="6" height="4.75" rx="1.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10.5 15v-1.1a1.5 1.5 0 0 1 3 0V15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  bookAi: RiBookAiFill,
  apps: RiAppsLine,
  palette: RiPaletteLine,
  sun: RiSunLine,
  moon: RiMoonLine,
  volume: RiVolumeUpLine,
  zoomIn: RiZoomInLine,
  zoomOut: RiZoomOutLine,
  subtract: RiSubtractLine,
  eraser: RiEraserLine,
  angle: ({ size, className, ...props }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M5 19V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 19H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 19A10 10 0 0 1 19 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  mirrorHorizontal: ({ size, className, ...props }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12 4V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2.6 2.6" />
      <path d="M4.5 7.5L9.5 12L4.5 16.5V7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M19.5 7.5L14.5 12L19.5 16.5V7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  mirrorVertical: ({ size, className, ...props }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 12H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2.6 2.6" />
      <path d="M7.5 4.5L12 9.5L16.5 4.5H7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7.5 19.5L12 14.5L16.5 19.5H7.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
};

function Icon({ name, size = 18, className = '', title }) {
  const IconComponent = iconMap[name] || RiFileTextLine;

  return (
    <IconComponent
      size={size}
      className={`svg-icon ${className}`.trim()}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      title={title}
    />
  );
}

export default Icon;
