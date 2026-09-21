import { Component } from 'react';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('应用运行时异常', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-panel">
            <h1>页面运行时出错</h1>
            <p>{this.state.error.message || '请刷新页面后重试。'}</p>
            <button onClick={() => window.location.reload()}>刷新页面</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
