import Icon from './Icon';

export default function GenerateCreditButton({
  cost = 1,
  running = false,
  loading = false,
  disabled = false,
  onClick,
  runLabel = '生成',
  cancelLabel = '取消生成',
  className = '',
}) {
  const label = running ? cancelLabel : runLabel;
  return (
    <div className={['generate-credit-button', running && 'is-running', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      <span className="generate-credit-button-cost" aria-label={`预计消耗 ${cost} 积分`}>
        <Icon name="lightning" size={14} />
        <span>{cost}</span>
      </span>
      <button
        type="button"
        className={`generate-credit-button-action ${running ? 'cancel' : ''}`}
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
      >
        <Icon name={running ? 'stop' : loading ? 'loader' : 'arrowUp'} size={16} />
      </button>
    </div>
  );
}
