import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './components/Icon';
import MaterialPicker from './components/MaterialPicker';
import { API_BASE } from './apiBase';

const DEFAULT_GROUP_NAME = '默认分组';

const makeChatId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const normalizeModelList = (value) => (
  Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : String(value || '').split(/[\n,，]/).map(item => item.trim()).filter(Boolean)
);

const getChatModels = (provider) => {
  const textModels = normalizeModelList(provider?.textModels);
  return textModels;
};

const pickDefaultModel = (provider, models) => (
  models.includes(provider?.defaultTextModel) ? provider.defaultTextModel : models[0] || ''
);

const formatAttachmentSize = (size) => {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const createDefaultGroup = (parentId = null) => ({
  id: makeChatId('chat_group'),
  name: DEFAULT_GROUP_NAME,
  parentId,
  createdAt: new Date().toISOString(),
});

const getGroupDepth = (groupId, groups) => {
  let depth = 0;
  let current = groups.find(g => g.id === groupId);
  while (current?.parentId) {
    depth += 1;
    if (depth > 3) break;
    current = groups.find(g => g.id === current.parentId);
  }
  return depth;
};

const buildGroupTree = (groups) => {
  const map = new Map(groups.map(g => [g.id, { ...g, children: [] }]));
  const roots = [];
  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};

const getSessionTitle = (messages) => {
  const firstUserMessage = messages.find(message => message.role === 'user');
  const title = firstUserMessage?.content?.trim() || '新对话';
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
};

function ChatView({ apiConfigs, chatGroups, setChatGroups, chatSessions, setChatSessions, materials, materialGroups }) {
  const enabledProviders = useMemo(
    () => apiConfigs.filter(provider => provider.enabled !== false && getChatModels(provider).length > 0),
    [apiConfigs]
  );
  const fallbackGroup = useMemo(() => chatGroups[0] || null, [chatGroups]);
  const [activeSessionId, setActiveSessionId] = useState(chatSessions[0]?.id || null);
  const [activeGroupId, setActiveGroupId] = useState(fallbackGroup?.id || null);
  const [favoritesMode, setFavoritesMode] = useState(false);
  const [groupMenuOpenId, setGroupMenuOpenId] = useState(null);
  const [sessionMenuOpenId, setSessionMenuOpenId] = useState(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set(fallbackGroup?.id ? [fallbackGroup.id] : []));
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [draftProviderId, setDraftProviderId] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const activeSession = chatSessions.find(session => session.id === activeSessionId) || null;
  const selectedProvider = enabledProviders.find(provider => provider.id === (activeSession?.providerId || draftProviderId)) || enabledProviders[0] || null;
  const modelOptions = getChatModels(selectedProvider);
  const modelValue = activeSession?.model || draftModel;
  const selectedModel = modelOptions.includes(modelValue)
    ? modelValue
    : pickDefaultModel(selectedProvider, modelOptions);
  const unsortedSessions = chatSessions.filter(session => !session.groupId);
  const favoriteMessages = useMemo(() => (
    chatSessions.flatMap(session => (
      (session.messages || [])
        .filter(message => message.favorite)
        .map(message => ({
          ...message,
          sessionId: session.id,
          sessionTitle: session.title || '新对话',
          sessionUpdatedAt: session.updatedAt,
        }))
    ))
  ), [chatSessions]);

  useEffect(() => {
    if (chatGroups.length > 0) return;
    setChatGroups([createDefaultGroup()]);
  }, [chatGroups.length, setChatGroups]);

  useEffect(() => {
    if (!activeGroupId && fallbackGroup?.id) {
      setActiveGroupId(fallbackGroup.id);
    }
  }, [activeGroupId, fallbackGroup]);

  useEffect(() => {
    if (activeSessionId && chatSessions.some(session => session.id === activeSessionId)) return;
    setActiveSessionId(chatSessions[0]?.id || null);
  }, [activeSessionId, chatSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [activeSession?.messages?.length, sending]);

  useEffect(() => {
    if (!selectedProvider?.id || draftProviderId) return;
    setDraftProviderId(selectedProvider.id);
  }, [draftProviderId, selectedProvider?.id]);

  useEffect(() => {
    if (!selectedModel || draftModel === selectedModel) return;
    setDraftModel(selectedModel);
  }, [draftModel, selectedModel]);

  const updateSession = useCallback((sessionId, patch) => {
    setChatSessions(prev => prev.map(session => (
      session.id === sessionId
        ? { ...session, ...patch, updatedAt: new Date().toISOString() }
        : session
    )));
  }, [setChatSessions]);

  const upsertSession = useCallback((session, patch) => {
    const nextSession = {
      ...session,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setChatSessions(prev => {
      const exists = prev.some(item => item.id === nextSession.id);
      if (!exists) return [nextSession, ...prev];
      return prev.map(item => (
        item.id === nextSession.id ? { ...item, ...nextSession } : item
      ));
    });
  }, [setChatSessions]);

  const createSession = useCallback((groupId = null) => {
    const targetGroupId = groupId;
    const provider = enabledProviders.find(item => item.id === draftProviderId) || enabledProviders[0] || null;
    const models = getChatModels(provider);
    const model = models.includes(draftModel) ? draftModel : pickDefaultModel(provider, models);
    const session = {
      id: makeChatId('chat'),
      groupId: targetGroupId,
      title: '新对话',
      providerId: provider?.id || '',
      model,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setChatSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    setActiveGroupId(targetGroupId || 'history');
    setFavoritesMode(false);
    setInputText('');
    setAttachments([]);
    return session;
  }, [draftModel, draftProviderId, enabledProviders, setChatSessions]);

  const createGroup = useCallback((parentId = null) => {
    const depth = parentId ? getGroupDepth(parentId, chatGroups) : 0;
    if (depth >= 2) {
      window.alert('分组最多支持三级，无法在此分组下新建子分组');
      return;
    }
    const name = window.prompt('分组名称', `分组 ${chatGroups.length + 1}`);
    const cleanName = name?.trim();
    if (!cleanName) return;
    const group = {
      id: makeChatId('chat_group'),
      name: cleanName,
      parentId,
      createdAt: new Date().toISOString(),
    };
    setChatGroups(prev => [...prev, group]);
    if (!parentId) {
      setActiveGroupId(group.id);
      setFavoritesMode(false);
    }
  }, [chatGroups, setChatGroups]);

  const renameGroup = useCallback((groupId) => {
    const group = chatGroups.find(g => g.id === groupId);
    if (!group) return;
    const name = window.prompt('重命名分组', group.name);
    const cleanName = name?.trim();
    if (!cleanName || cleanName === group.name) return;
    setChatGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: cleanName } : g));
  }, [chatGroups, setChatGroups]);

  const deleteGroup = useCallback((groupId) => {
    const group = chatGroups.find(g => g.id === groupId);
    if (!group) return;
    if (group.name === DEFAULT_GROUP_NAME) {
      window.alert('默认分组不能删除');
      return;
    }
    if (!window.confirm(`确定要删除分组"${group.name}"吗？分组内的对话将回到"历史对话"。`)) return;
    // 收集所有子分组（递归）
    const allGroupIds = new Set([groupId]);
    const collectChildren = (parentId) => {
      chatGroups.forEach(g => {
        if (g.parentId === parentId && !allGroupIds.has(g.id)) {
          allGroupIds.add(g.id);
          collectChildren(g.id);
        }
      });
    };
    collectChildren(groupId);
    // 将这些分组下的对话 groupId 置空
    setChatSessions(prev => prev.map(s =>
      allGroupIds.has(s.groupId) ? { ...s, groupId: null, updatedAt: new Date().toISOString() } : s
    ));
    // 删除分组
    setChatGroups(prev => prev.filter(g => !allGroupIds.has(g.id)));
    if (allGroupIds.has(activeGroupId)) {
      setActiveGroupId(fallbackGroup?.id || null);
    }
  }, [chatGroups, setChatGroups, setChatSessions, activeGroupId, fallbackGroup]);

  const deleteSession = useCallback((event, sessionId) => {
    event.stopPropagation();
    setChatSessions(prev => prev.filter(session => session.id !== sessionId));
  }, [setChatSessions]);

  // 拖拽历史对话到分组
  const [draggingSessionId, setDraggingSessionId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);

  const handleSessionDragStart = useCallback((event, sessionId) => {
    setDraggingSessionId(sessionId);
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', sessionId);
    } catch (e) { /* ignore */ }
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, []);

  const handleGroupDragOver = useCallback((event, groupId) => {
    if (!draggingSessionId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverGroupId(groupId);
  }, [draggingSessionId]);

  const handleGroupDragLeave = useCallback((event, groupId) => {
    if (dragOverGroupId === groupId) {
      setDragOverGroupId(null);
    }
  }, [dragOverGroupId]);

  const handleGroupDrop = useCallback((event, groupId) => {
    event.preventDefault();
    const sessionId = event.dataTransfer.getData('text/plain') || draggingSessionId;
    if (!sessionId) return;
    setChatSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, groupId, updatedAt: new Date().toISOString() } : s
    ));
    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [draggingSessionId, setChatSessions]);

  const handleProviderChange = useCallback((providerId) => {
    const provider = enabledProviders.find(item => item.id === providerId);
    const models = getChatModels(provider);
    setDraftProviderId(providerId);
    setDraftModel(pickDefaultModel(provider, models));
    if (activeSession) {
      updateSession(activeSession.id, {
        providerId,
        model: pickDefaultModel(provider, models),
      });
    }
  }, [activeSession, enabledProviders, updateSession]);

  const handleModelChange = useCallback((model) => {
    setDraftModel(model);
    if (activeSession) {
      updateSession(activeSession.id, { model });
    }
  }, [activeSession, updateSession]);

  const handleFiles = useCallback((files) => {
    const selectedFiles = Array.from(files || []);
    selectedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(prev => [...prev, {
          id: makeChatId('attachment'),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: String(reader.result || ''),
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeAttachment = useCallback((attachmentId) => {
    setAttachments(prev => prev.filter(item => item.id !== attachmentId));
  }, []);

  const handleMaterialSelect = useCallback((selected) => {
    const newAttachments = selected.map(material => ({
      id: makeChatId('attachment'),
      name: material.name || '素材',
      mimeType: material.type === 'video' ? 'video/mp4' : 'image/png',
      size: 0,
      dataUrl: material.imageUrl,
      source: 'material',
      materialId: material.id,
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
    setMaterialPickerOpen(false);
  }, []);

  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content && attachments.length === 0) return;
    if (!selectedProvider || !selectedModel) {
      setErrorMessage('请先在设置中配置可用于聊天的 API 平台和模型。');
      return;
    }

    const session = activeSession || createSession(null);
    const sessionId = session?.id || activeSessionId;
    if (!sessionId) return;

    const userMessage = {
      id: makeChatId('message'),
      role: 'user',
      content,
      attachments,
      createdAt: new Date().toISOString(),
    };
    const pendingAssistantMessage = {
      id: makeChatId('message'),
      role: 'assistant',
      content: '',
      status: 'thinking',
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...(session?.messages || []), userMessage, pendingAssistantMessage];

    setInputText('');
    setAttachments([]);
    setSending(true);
    setErrorMessage('');
    upsertSession(session, {
      title: session?.messages?.length ? session.title : getSessionTitle([userMessage]),
      providerId: selectedProvider.id,
      model: selectedModel,
      messages: nextMessages,
    });

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_base_url: selectedProvider.baseUrl,
          api_key: selectedProvider.apiKey,
          model_name: selectedModel,
          messages: nextMessages
            .filter(message => message.role !== 'assistant' || message.content)
            .map(message => ({
              role: message.role,
              content: message.content,
              attachments: (message.attachments || []).map(item => ({
                name: item.name,
                mime_type: item.mimeType,
                size: item.size,
                data_url: item.dataUrl,
              })),
            })),
        }),
      });
      const payload = await response.json();
      const assistantContent = payload.success
        ? payload.response
        : `错误：${payload.error || payload.detail || '请求失败'}`;
      upsertSession(session, {
        messages: nextMessages.map(message => (
          message.id === pendingAssistantMessage.id
            ? { ...message, content: assistantContent, status: payload.success ? 'done' : 'error' }
            : message
        )),
      });
    } catch (error) {
      upsertSession(session, {
        messages: nextMessages.map(message => (
          message.id === pendingAssistantMessage.id
            ? { ...message, content: `错误：${error.message}`, status: 'error' }
            : message
        )),
      });
    } finally {
      setSending(false);
    }
  }, [activeSession, activeSessionId, attachments, createSession, inputText, selectedModel, selectedProvider, upsertSession]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const openSession = useCallback((sessionId) => {
    setActiveSessionId(sessionId);
    setFavoritesMode(false);
  }, []);

  const openFavorites = useCallback(() => {
    setFavoritesMode(true);
    setActiveSessionId(null);
  }, []);

  const toggleMessageFavorite = useCallback((sessionId, messageId) => {
    setChatSessions(prev => prev.map(session => (
      session.id !== sessionId
        ? session
        : {
          ...session,
          messages: (session.messages || []).map(message => (
            message.id === messageId ? { ...message, favorite: !message.favorite } : message
          )),
          updatedAt: new Date().toISOString(),
        }
    )));
  }, [setChatSessions]);

  const copyMessageContent = useCallback(async (content, messageId) => {
    const text = String(content || '');
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId(current => current === messageId ? null : current);
      }, 1200);
    } catch (error) {
      setErrorMessage(`复制失败：${error.message}`);
    }
  }, []);

  const openFavoriteMessage = useCallback((sessionId) => {
    setActiveSessionId(sessionId);
    setFavoritesMode(false);
  }, []);

  const renderSessionList = (sessions, draggable = false, inGroup = false) => sessions.map(session => (
    <div
      className={`chat-session-item ${session.id === activeSessionId ? 'active' : ''}`}
      key={session.id}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={draggable ? (e) => handleSessionDragStart(e, session.id) : undefined}
      onDragEnd={draggable ? handleSessionDragEnd : undefined}
      onClick={() => openSession(session.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openSession(session.id);
      }}
    >
      <span>{session.title || '新对话'}</span>
      <small>{formatAttachmentSize((session.messages || []).flatMap(message => message.attachments || []).reduce((sum, item) => sum + (item.size || 0), 0)) || `更新于${new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</small>
      <span className="chat-session-actions">
        {inGroup && (
          <button
            type="button"
            title="移出分组"
            onClick={(event) => {
              event.stopPropagation();
              setChatSessions(prev => prev.map(s =>
                s.id === session.id ? { ...s, groupId: null, updatedAt: new Date().toISOString() } : s
              ));
            }}
          >
            <Icon name="arrowLeft" size={12} />
          </button>
        )}
        {!inGroup && (
          <>
            <button
              type="button"
              className="chat-session-more-trigger"
              title="更多"
              onClick={(event) => {
                event.stopPropagation();
                setSessionMenuOpenId(sessionMenuOpenId === session.id ? null : session.id);
              }}
            >
              <Icon name="more" size={14} />
            </button>
            {sessionMenuOpenId === session.id && (
              <div
                ref={sessionMenuRef}
                className="chat-session-dropdown"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="dropdown-item danger"
                  onClick={(event) => {
                    setSessionMenuOpenId(null);
                    deleteSession(event, session.id);
                  }}
                >
                  <Icon name="trash" size={13} /> 删除
                </button>
              </div>
            )}
          </>
        )}
      </span>
    </div>
  ));

  const renderFavoriteMessages = () => favoriteMessages.map(message => (
    <article className="chat-favorite-message" key={`${message.sessionId}-${message.id}`}>
      <button
        type="button"
        className="chat-favorite-message-body"
        onClick={() => openFavoriteMessage(message.sessionId)}
      >
        <span>{message.content || '空消息'}</span>
        <small>{message.sessionTitle} · 更新于{new Date(message.sessionUpdatedAt || message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </button>
      <div className="chat-favorite-message-actions">
        <button
          type="button"
          title="取消收藏"
          onClick={() => toggleMessageFavorite(message.sessionId, message.id)}
        >
          ★
        </button>
        <button
          type="button"
          title="复制内容"
          onClick={() => copyMessageContent(message.content, message.id)}
        >
          <Icon name="copy" size={14} />
        </button>
      </div>
    </article>
  ));

  const groupTree = useMemo(() => buildGroupTree(chatGroups), [chatGroups]);

  const toggleGroupExpand = useCallback((groupId) => {
    setExpandedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // 判断一个分组是否"实际上应该显示"（所有祖先分组都展开）
  // 返回 Map<groupId, boolean>
  const visibleGroupIds = useMemo(() => {
    const map = new Map();
    const walk = (node, ancestorExpanded) => {
      const selfExpanded = expandedGroupIds.has(node.id);
      map.set(node.id, ancestorExpanded);
      const childrenExpanded = ancestorExpanded && selfExpanded;
      if (node.children) {
        node.children.forEach(child => walk(child, childrenExpanded));
      }
    };
    groupTree.forEach(root => walk(root, true));
    return map;
  }, [groupTree, expandedGroupIds]);

  // 递归渲染分组（最多三级）
  const renderGroup = (group, depth = 0) => {
    // 父级未展开时，子分组不渲染
    if (!visibleGroupIds.get(group.id)) return null;

    const isActive = activeGroupId === group.id && !favoritesMode;
    const isExpanded = expandedGroupIds.has(group.id);
    const groupSessions = chatSessions.filter(s => s.groupId === group.id);
    const isDragOver = dragOverGroupId === group.id;
    const isDefault = group.name === DEFAULT_GROUP_NAME;
    const handleGroupTitleClick = () => {
      setActiveGroupId(group.id);
      setFavoritesMode(false);
      toggleGroupExpand(group.id);
    };
    return (
      <section className="chat-group" key={group.id} style={{ marginLeft: depth > 0 ? `${depth * 16}px` : 0 }}>
        <div
          className={`chat-group-title ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
          draggable={!!draggingSessionId}
          onClick={handleGroupTitleClick}
          onDragOver={(e) => handleGroupDragOver(e, group.id)}
          onDragLeave={(e) => handleGroupDragLeave(e, group.id)}
          onDrop={(e) => handleGroupDrop(e, group.id)}
        >
          <button
            type="button"
            className="chat-group-toggle"
            aria-label={isExpanded ? '收起' : '展开'}
          >
            <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={12} />
          </button>
          <button
            type="button"
            className="chat-group-title-btn"
          >
            <Icon name={depth === 0 ? 'folder' : 'fileText'} size={14} />
            <span>{group.name}</span>
            {groupSessions.length > 0 && <strong className="chat-group-count">{groupSessions.length}</strong>}
          </button>
          <div className="chat-group-actions">
            {depth < 2 && (
              <button
                type="button"
                className="chat-group-action-btn"
                title="新建子分组"
                onClick={(e) => { e.stopPropagation(); createGroup(group.id); }}
              >
                <Icon name="add" size={13} />
              </button>
            )}
            {!isDefault && (
              <button
                type="button"
                className="chat-group-action-btn chat-group-more-trigger"
                title="更多"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupMenuOpenId(groupMenuOpenId === group.id ? null : group.id);
                }}
              >
                <Icon name="more" size={13} />
              </button>
            )}
            {groupMenuOpenId === group.id && (
              <div
                ref={groupMenuRef}
                className="chat-group-dropdown"
                onClick={(e) => e.stopPropagation()}
              >
                <button className="dropdown-item" onClick={() => { renameGroup(group.id); setGroupMenuOpenId(null); }}>
                  <Icon name="edit" size={13} /> 重命名
                </button>
                <button className="dropdown-item danger" onClick={() => { deleteGroup(group.id); setGroupMenuOpenId(null); }}>
                  <Icon name="trash" size={13} /> 删除分组
                </button>
              </div>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="chat-session-list">
            {renderSessionList(groupSessions, true, true)}
            {groupSessions.length === 0 && <div className="chat-empty-row">这个分组还没有对话</div>}
          </div>
        )}
        {depth < 2 && group.children && group.children.map(child => renderGroup(child, depth + 1))}
      </section>
    );
  };

  // 关闭分组菜单（点击外部）
  const groupMenuRef = useRef(null);
  const sessionMenuRef = useRef(null);
  useEffect(() => {
    if (!groupMenuOpenId) return;
    const handleClick = (e) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target) && !e.target.closest('.chat-group-more-trigger')) {
        setGroupMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [groupMenuOpenId]);

  useEffect(() => {
    if (!sessionMenuOpenId) return;
    const handleClick = (e) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target) && !e.target.closest('.chat-session-more-trigger')) {
        setSessionMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sessionMenuOpenId]);

  return (
    <main className="chat-page">
      <aside className="chat-history-pane">
        <div className="chat-history-header">
          <h1>聊天</h1>
          <button type="button" className="small-action-btn" onClick={() => createSession(null)}>
            新建
          </button>
        </div>

        <button
          type="button"
          className={`chat-favorite-entry ${favoritesMode ? 'active' : ''}`}
          onClick={openFavorites}
        >
          <span>收藏</span>
          <strong>{favoriteMessages.length}</strong>
        </button>

        <div className="chat-group-toolbar">
          <span>历史分组</span>
          <button type="button" onClick={() => createGroup(null)}>
            <Icon name="add" size={12} /> 新建分组
          </button>
        </div>

        <div className="chat-group-list">
          {groupTree.map(group => renderGroup(group, 0))}
        </div>

        <div className="chat-history-section">
          <div
            className={`chat-history-header ${dragOverGroupId === 'history' ? 'drag-over' : ''}`}
            onDragOver={(e) => handleGroupDragOver(e, 'history')}
            onDragLeave={(e) => handleGroupDragLeave(e, 'history')}
            onDrop={(e) => {
              e.preventDefault();
              const sessionId = e.dataTransfer.getData('text/plain') || draggingSessionId;
              if (!sessionId) return;
              setChatSessions(prev => prev.map(s =>
                s.id === sessionId ? { ...s, groupId: null, updatedAt: new Date().toISOString() } : s
              ));
              setDraggingSessionId(null);
              setDragOverGroupId(null);
            }}
          >
            <Icon name="layers" size={14} />
            <span>历史对话</span>
            <strong className="chat-group-count">{unsortedSessions.length}</strong>
          </div>
          <div className="chat-session-list">
            {renderSessionList(unsortedSessions, true)}
            {unsortedSessions.length === 0 && <div className="chat-empty-row">没有历史对话</div>}
          </div>
        </div>
      </aside>

      <section className="chat-main-pane">
        {favoritesMode ? (
          <div className="chat-favorites-view">
            <div className="chat-conversation-header">
              <div>
                <h2>收藏</h2>
                <p>{favoriteMessages.length} 条已收藏内容</p>
              </div>
            </div>
            <div className="chat-favorite-list">
              {favoriteMessages.length > 0 ? renderFavoriteMessages() : (
                <div className="chat-empty-state">还没有收藏内容</div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="chat-conversation-header">
              <div>
                <h2>{activeSession?.title || '新对话'}</h2>
              </div>
            </div>

            <div className="chat-message-list">
              {(activeSession?.messages || []).length > 0 ? activeSession.messages.map(message => (
                <article className={`chat-message ${message.role}`} key={message.id}>
                  <div className="chat-message-stack">
                    <div className="chat-message-bubble">
                      {message.status === 'thinking' ? <span className="chat-thinking">正在思考...</span> : message.content}
                      {(message.attachments || []).length > 0 && (
                        <div className="chat-attachment-list">
                          {message.attachments.map(item => (
                            <div className="chat-attachment-chip" key={item.id}>
                              {item.mimeType?.startsWith('image/') && item.dataUrl ? <img src={item.dataUrl} alt={item.name} /> : <Icon name="fileText" size={15} />}
                              <span>{item.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {message.role === 'assistant' && message.content && (
                      <div className="chat-message-tools">
                        <button
                          type="button"
                          className={message.favorite ? 'active' : ''}
                          title={message.favorite ? '取消收藏' : '收藏回复'}
                          onClick={() => toggleMessageFavorite(activeSession.id, message.id)}
                        >
                          {message.favorite ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          title="复制回复"
                          onClick={() => copyMessageContent(message.content, message.id)}
                        >
                          {copiedMessageId === message.id ? '已复制' : <Icon name="copy" size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              )) : (
                <div className="chat-empty-state">选择一个历史对话，或新建对话开始聊天</div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-composer">
              {errorMessage && <div className="chat-error">{errorMessage}</div>}
              {attachments.length > 0 && (
                <div className="chat-composer-attachments">
                  {attachments.map(item => (
                    <button type="button" key={item.id} onClick={() => removeAttachment(item.id)}>
                      {item.mimeType.startsWith('image/') ? <img src={item.dataUrl} alt={item.name} /> : <Icon name="fileText" size={14} />}
                      <span>{item.name}</span>
                      <strong>×</strong>
                    </button>
                  ))}
                </div>
              )}
              <div className="chat-composer-box">
                <textarea
                  value={inputText}
                  onChange={event => setInputText(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息..."
                  rows={3}
                />
                <div className="chat-composer-toolbar">
                  <div className="chat-composer-left">
                    <input ref={fileInputRef} type="file" multiple onChange={event => handleFiles(event.target.files)} />
                    <button type="button" className="chat-attach-btn" onClick={() => fileInputRef.current?.click()}>
                      <Icon name="add" size={16} />
                      <span>添加</span>
                    </button>
                    <button
                      type="button"
                      className="chat-attach-btn"
                      onClick={() => setMaterialPickerOpen(true)}
                      disabled={!materials || materials.length === 0}
                      title={!materials || materials.length === 0 ? '素材库为空' : '从素材库选择'}
                    >
                      <Icon name="image" size={16} />
                      <span>素材</span>
                    </button>
                    <div className="chat-composer-models">
                      <select value={selectedProvider?.id || ''} onChange={event => handleProviderChange(event.target.value)}>
                        {enabledProviders.length > 0 ? enabledProviders.map(provider => (
                          <option key={provider.id} value={provider.id}>{provider.name || 'API'}</option>
                        )) : <option value="">未配置 API</option>}
                      </select>
                      <select value={selectedModel || ''} onChange={event => handleModelChange(event.target.value)}>
                        {modelOptions.length > 0 ? modelOptions.map(model => (
                          <option key={model} value={model}>{model}</option>
                        )) : <option value="">未配置模型</option>}
                      </select>
                    </div>
                  </div>
                  <button type="button" className="chat-send-btn" onClick={sendMessage} disabled={sending || (!inputText.trim() && attachments.length === 0)}>
                    <Icon name={sending ? 'loader' : 'play'} size={16} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {materialPickerOpen && (
        <MaterialPicker
          materials={materials}
          materialGroups={materialGroups}
          onSelect={handleMaterialSelect}
          onClose={() => setMaterialPickerOpen(false)}
          multiSelect
        />
      )}
    </main>
  );
}

export default ChatView;
