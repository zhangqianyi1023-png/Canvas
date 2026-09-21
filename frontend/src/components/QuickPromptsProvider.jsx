import { useCallback, useEffect, useMemo, useState } from 'react';
import * as storage from '../storage';
import QuickPromptContext from '../quickPromptContext';
import {
  createDefaultQuickPromptState,
  normalizeQuickPromptState,
  resetBuiltinQuickPrompt,
} from '../quickPrompts';

const STORAGE_KEY = 'ai-canvas.quickPrompts';
const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const now = () => new Date().toISOString();

function QuickPromptsProvider({ children }) {
  const [state, setState] = useState(createDefaultQuickPromptState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage.getItem(STORAGE_KEY).then(stored => {
      if (cancelled) return;
      setState(normalizeQuickPromptState(stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    storage.setItem(STORAGE_KEY, state);
  }, [ready, state]);

  const createPrompt = useCallback(({ title, content, categoryId = 'custom' }) => {
    const created = {
      id: makeId('quick_prompt'),
      title: String(title || '').trim(),
      content: String(content || '').trim(),
      categoryId: categoryId || 'custom',
      source: 'custom',
      sortOrder: Date.now(),
      createdAt: now(),
      updatedAt: now(),
    };
    setState(current => normalizeQuickPromptState({
      ...current,
      prompts: [created, ...current.prompts],
    }));
    return created;
  }, []);

  const updatePrompt = useCallback((promptId, patch) => {
    let updated = null;
    setState(current => normalizeQuickPromptState({
      ...current,
      prompts: current.prompts.map(prompt => {
        if (prompt.id !== promptId) return prompt;
        updated = {
          ...prompt,
          ...patch,
          title: String(patch.title ?? prompt.title).trim(),
          content: String(patch.content ?? prompt.content).trim(),
          updatedAt: now(),
        };
        return updated;
      }),
    }));
    return updated;
  }, []);

  const deletePrompt = useCallback(promptId => {
    setState(current => ({
      ...current,
      prompts: current.prompts.filter(prompt => prompt.id !== promptId || prompt.source === 'builtin'),
    }));
  }, []);

  const restorePrompt = useCallback(promptId => {
    const original = resetBuiltinQuickPrompt(promptId);
    if (!original) return null;
    setState(current => normalizeQuickPromptState({
      ...current,
      prompts: current.prompts.map(prompt => (
        prompt.id === promptId ? { ...original } : prompt
      )),
    }));
    return original;
  }, []);

  const createCategory = useCallback(name => {
    const category = {
      id: makeId('quick_category'),
      name: String(name || '').trim(),
      system: false,
    };
    setState(current => normalizeQuickPromptState({
      ...current,
      categories: [...current.categories, category],
    }));
    return category;
  }, []);

  const renameCategory = useCallback((categoryId, name) => {
    setState(current => normalizeQuickPromptState({
      ...current,
      categories: current.categories.map(category => (
        category.id === categoryId && !category.system
          ? { ...category, name: String(name || '').trim() || category.name }
          : category
      )),
    }));
  }, []);

  const deleteCategory = useCallback(categoryId => {
    setState(current => normalizeQuickPromptState({
      categories: current.categories.filter(category => category.id !== categoryId || category.system),
      prompts: current.prompts.map(prompt => (
        prompt.categoryId === categoryId ? { ...prompt, categoryId: 'custom' } : prompt
      )),
    }));
  }, []);

  const value = useMemo(() => ({
    ...state,
    ready,
    createPrompt,
    updatePrompt,
    deletePrompt,
    restorePrompt,
    createCategory,
    renameCategory,
    deleteCategory,
  }), [createCategory, createPrompt, deleteCategory, deletePrompt, ready, renameCategory, restorePrompt, state, updatePrompt]);

  return <QuickPromptContext.Provider value={value}>{children}</QuickPromptContext.Provider>;
}

export default QuickPromptsProvider;
