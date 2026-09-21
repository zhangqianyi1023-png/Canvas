import { useMemo, useState } from 'react';
import Icon from './Icon';

const steps = [
  { id: 'outline', label: '01 剧本大纲' },
  { id: 'library', label: '02 资料库' },
  { id: 'segments', label: '03 片段分镜' },
];

const getCardTitle = (card, index) => (
  card.segmentTitle || card.cameraMovement || `片段 ${String(index + 1).padStart(2, '0')}`
);

function VideoWorkbenchDialog({ node, onClose }) {
  const [activeStep, setActiveStep] = useState(2);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const data = node?.data || {};
  const cards = Array.isArray(data.storyboardCards) ? data.storyboardCards : [];
  const selectedCard = cards[selectedCardIndex] || cards[0] || {};
  const resourcePackage = data.storyboardResourcePackage || {};

  const resourceCards = useMemo(() => {
    const items = [];
    if (resourcePackage.characterLock) {
      items.push({ type: 'role', label: '主角色', title: '角色设定', body: resourcePackage.characterLock });
    }
    if (resourcePackage.sceneLock) {
      items.push({ type: 'scene', label: '主场景', title: '场景图片', body: resourcePackage.sceneLock });
    }
    return items;
  }, [resourcePackage]);

  const renderOutline = () => (
    <section className="video-workbench-stage-grid">
      <article className="video-workbench-panel">
        <header><strong>剧本大纲</strong><span>storyboard_stage: script</span></header>
        <pre className="video-workbench-outline">{data.result || data.storyboardVoiceoverScript || '暂无剧本大纲'}</pre>
      </article>
      <aside className="video-workbench-panel">
        <header><strong>配套生成器</strong></header>
        <div className="video-workbench-meta">
          <div><strong>隐藏 GeneratorNode</strong><span>generatorType: generateStoryboardScript</span></div>
          <div><strong>输出</strong><span>outline / resources / cards 三阶段复用现有分镜生成器</span></div>
        </div>
      </aside>
    </section>
  );

  const renderLibrary = () => (
    <section className="video-workbench-library-grid">
      <article className="video-workbench-panel">
        <header><strong>资料库</strong><span>storyboard_stage: resources</span></header>
        <div className="video-workbench-assets">
          {resourceCards.length > 0 ? resourceCards.map((item) => (
            <button className="video-workbench-asset-card" type="button" key={item.label}>
              <div className={`video-workbench-asset-thumb ${item.type}`} />
              <span>{item.label}</span>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </button>
          )) : (
            <div className="video-workbench-empty">暂无角色或场景资料卡</div>
          )}
        </div>
      </article>
      <aside className="video-workbench-panel">
        <header><strong>片段全局约束</strong></header>
        <div className="video-workbench-meta">
          {resourcePackage.productIdentity && <div><strong>productIdentity</strong><span>{resourcePackage.productIdentity}</span></div>}
          {resourcePackage.visualStyle && <div><strong>globalStylePrompt</strong><span>{resourcePackage.visualStyle}</span></div>}
          {resourcePackage.seedanceGlobalPrompt && <div><strong>seedanceGlobalPrompt</strong><span>{resourcePackage.seedanceGlobalPrompt}</span></div>}
        </div>
      </aside>
    </section>
  );

  const renderSegments = () => (
    <section className="video-workbench-segments-grid">
      <section className="video-workbench-panel video-workbench-segment-strip">
        <header><strong>片段</strong><span>{cards.length} 个片段</span></header>
        <div className="video-workbench-segment-list">
          {cards.map((card, index) => (
            <button
              className={`video-workbench-segment-card ${selectedCardIndex === index ? 'active' : ''}`}
              type="button"
              key={`${card.segmentId || card.shotNo || index}`}
              onClick={() => setSelectedCardIndex(index)}
            >
              <div className={card.videoUrl ? 'generated' : ''}>{card.videoUrl ? '视频首帧' : '占位图'}</div>
              <strong>{card.segmentId || card.shotNo || String(index + 1).padStart(2, '0')} · {getCardTitle(card, index)}</strong>
              <span>{card.duration || `${card.durationSeconds || 0}s`} · {(card.shots || []).length || 1} 个分镜头</span>
            </button>
          ))}
        </div>
      </section>
      <article className="video-workbench-panel">
        <header><strong>{selectedCard.segmentId || selectedCard.shotNo} {getCardTitle(selectedCard, selectedCardIndex)}</strong><span>{selectedCard.duration || ''}</span></header>
        <div className="video-workbench-shot-list">
          {(selectedCard.shots || []).length > 0 ? selectedCard.shots.map((shot, index) => (
            <div className="video-workbench-shot-row" key={shot.shotId || index}>
              <strong>{String(index + 1).padStart(2, '0')}<br />{shot.durationSeconds}s</strong>
              <span>{shot.cameraMovement || '无运镜'}</span>
              <p>{shot.visualContent || '暂无画面描述'}<br />台词：{shot.dialogue || '无'}<br />字幕：{shot.subtitle || '无'}</p>
            </div>
          )) : (
            <div className="video-workbench-shot-row">
              <strong>01<br />{selectedCard.durationSeconds || 0}s</strong>
              <span>{selectedCard.cameraMovement || '无运镜'}</span>
              <p>{selectedCard.visualDescription || '暂无画面描述'}<br />旁白：{selectedCard.narration || '无'}</p>
            </div>
          )}
        </div>
        {selectedCard.globalStylePrompt && <div className="video-workbench-prompt-box"><strong>globalStylePrompt：</strong>{selectedCard.globalStylePrompt}</div>}
        {selectedCard.seedancePrompt && <div className="video-workbench-prompt-box"><strong>seedancePrompt：</strong>{selectedCard.seedancePrompt}</div>}
      </article>
      <aside className="video-workbench-panel">
        <header><strong>视频预览</strong><span>/api/video</span></header>
        <div className={`video-workbench-preview ${selectedCard.videoUrl ? 'generated' : ''}`}>{selectedCard.videoUrl ? '视频首帧' : '暂无视频'}</div>
        <div className="video-workbench-prompt-box">资料库素材 + globalStylePrompt + shots 结构化摘要 + consistencyPrompt + seedancePrompt + 负面提示词。</div>
      </aside>
    </section>
  );

  return (
    <section className="video-workbench-overlay" role="dialog" aria-modal="true" aria-label="视频工作台">
      <div className="video-workbench-dialog">
        <header className="video-workbench-top">
          <strong>视频工作台</strong>
          <nav>
            {steps.map((step, index) => (
              <button
                type="button"
                className={activeStep === index ? 'active' : ''}
                key={step.id}
                onClick={() => setActiveStep(index)}
              >
                {step.label}
              </button>
            ))}
          </nav>
          <button type="button" className="video-workbench-close" onClick={onClose} aria-label="关闭视频工作台">
            <Icon name="close" size={18} />
          </button>
        </header>
        <main className="video-workbench-body">
          {activeStep === 0 && renderOutline()}
          {activeStep === 1 && renderLibrary()}
          {activeStep === 2 && renderSegments()}
        </main>
      </div>
    </section>
  );
}

export default VideoWorkbenchDialog;
