import { useContext } from 'react';
import QuickPromptContext from './quickPromptContext';

export default function useQuickPrompts() {
  const value = useContext(QuickPromptContext);
  if (!value) throw new Error('快捷提示词功能尚未初始化');
  return value;
}
