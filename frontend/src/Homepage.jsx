import Icon from './components/Icon';
import { publicAsset } from './publicAsset';

const capabilities = [
  {
    icon: 'aiGenerateText',
    title: '提示词编排',
    text: '把角色、产品、镜头和风格拆成可复用节点，减少反复改提示词的摩擦。',
  },
  {
    icon: 'imageAdd',
    title: '参考素材',
    text: '上传图片、视频和音频，把素材关系保留在画布上，生成结果可追溯。',
  },
  {
    icon: 'smartSplitter',
    title: '智能拆分',
    text: '从一个创意方向扩展多条执行路径，让图像、视频和文案并行推进。',
  },
  {
    icon: 'movieAi',
    title: '视频生成',
    text: '衔接分镜、角色和参考图，集中管理生成任务与返回素材。',
  },
  {
    icon: 'folder',
    title: '素材库',
    text: '沉淀常用素材、结果和模板，跨项目调用时不必重新整理。',
  },
  {
    icon: 'barChartBoxAi',
    title: '任务中心',
    text: '异步生成、保存状态和媒体地址集中展示，长任务不用守着页面猜进度。',
  },
];

function PreviewNode({ className = '', icon, title, meta }) {
  return (
    <div className={`homepage-preview-node ${className}`.trim()}>
      <span className="homepage-preview-node-icon"><Icon name={icon} size={15} /></span>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
    </div>
  );
}

function Homepage({ onUseClick }) {
  return (
    <main className="homepage">
      <nav className="homepage-nav" aria-label="官网导航">
        <button type="button" className="homepage-brand" aria-label="InUx Canvas">
          <img src={publicAsset('sidebar-logo.png')} alt="" aria-hidden="true" />
          <span>InUx Canvas</span>
        </button>
        <div className="homepage-nav-actions">
          <button
            type="button"
            className="homepage-login-btn"
            onClick={onUseClick}
          >
            立即使用
          </button>
        </div>
      </nav>

      <section className="homepage-hero">
        <div className="homepage-hero-copy">
          <span className="homepage-eyebrow">AI Creative Canvas</span>
          <h1>InUx Canvas</h1>
          <p>
            面向 AI 内容生产的本地优先画布，把提示词、参考素材、生成任务和结果沉淀在同一个工作空间里。
          </p>
          <div className="homepage-hero-actions">
            <button type="button" className="homepage-primary-action" onClick={onUseClick}>
              <Icon name="compass" size={17} />
              立即使用
            </button>
            <span>图像、视频、语音和模板工作流统一编排</span>
          </div>
        </div>

        <div className="homepage-preview" aria-label="画布能力预览">
          <div className="homepage-preview-toolbar">
            <span></span>
            <strong>新品短片工作流</strong>
            <em>running</em>
          </div>
          <div className="homepage-preview-canvas">
            <svg className="homepage-preview-lines" viewBox="0 0 680 420" aria-hidden="true">
              <path d="M160 112 C230 112 230 192 302 192" />
              <path d="M164 274 C242 274 232 218 302 218" />
              <path d="M430 204 C498 204 498 138 562 138" />
              <path d="M430 226 C498 226 498 302 562 302" />
            </svg>
            <PreviewNode className="node-prompt" icon="quoteText" title="创意提示词" meta="角色调性 / 场景 / 镜头" />
            <PreviewNode className="node-media" icon="imageAdd" title="参考素材" meta="产品图 / 人物 / 音频" />
            <PreviewNode className="node-split" icon="smartSplitter" title="智能拆分" meta="4 条方向并行生成" />
            <PreviewNode className="node-image" icon="imageGen" title="图像结果" meta="已保存 12 张" />
            <PreviewNode className="node-video" icon="videoGenFill" title="视频结果" meta="队列中 3 个任务" />
          </div>
        </div>
      </section>

      <section className="homepage-capabilities" aria-label="画布能力">
        {capabilities.map(item => (
          <article key={item.title} className="homepage-capability">
            <span className="homepage-capability-icon"><Icon name={item.icon} size={18} /></span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default Homepage;
