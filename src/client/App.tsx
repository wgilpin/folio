import React, { useEffect, useRef, useState } from 'react';
import {
  getConciseTitle,
  type ConceptBlock,
  type DocumentNode,
  type EphemeralChatThread,
  type LearnerProfile,
  type NotebookSettings,
  type PendingSuggestedEdit,
  type TocItem,
  type TopicFamiliarity,
} from '../shared/schema.js';
import { ConceptBlockCard } from './components/ConceptBlockCard.js';
import { DocumentChatDrawer } from './components/DocumentChatDrawer.js';
import { GateBanner } from './components/GateBanner.js';
import { SeedModal } from './components/SeedModal.js';
import { SidebarTree } from './components/SidebarTree.js';
import { restoreScroll, scrollToPosition } from './scroll.js';

interface DocApiResponse {
  document: DocumentNode | null;
  documents?: Record<string, DocumentNode>;
  blocks: ConceptBlock[];
  toc: TocItem[];
  activeChat?: EphemeralChatThread | null;
  pendingEdits?: PendingSuggestedEdit[];
  modelId: string;
  settings?: NotebookSettings;
  workspaceDir?: string;
  workspaces?: string[];
  profile?: LearnerProfile;
}

export function App(): React.ReactElement {
  const [document, setDocument] = useState<DocumentNode | null>(null);
  const [documents, setDocuments] = useState<Record<string, DocumentNode>>({});
  const [blocks, setBlocks] = useState<ConceptBlock[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeChat, setActiveChat] = useState<EphemeralChatThread | null>(null);
  const [activeChatBlockId, setActiveChatBlockId] = useState<string | null>(null);
  const [isDocChatOpen, setIsDocChatOpen] = useState<boolean>(false);
  const [isSendingDocChat, setIsSendingDocChat] = useState<boolean>(false);
  const [isIntegratingDocChat, setIsIntegratingDocChat] = useState<boolean>(false);
  const [isBranchingDocChat, setIsBranchingDocChat] = useState<boolean>(false);
  const [docChatError, setDocChatError] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingSuggestedEdit[]>([]);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [isIntegratingChat, setIsIntegratingChat] = useState<boolean>(false);
  const [isBranchingChat, setIsBranchingChat] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>('anthropic:claude-opus-4-6');
  const [settings, setSettings] = useState<NotebookSettings>({
    modelId: 'anthropic:claude-opus-4-6',
    reasoningEffort: 'high',
    activeProfileId: 'intuitive-physical',
    customSystemPrompt: '',
  });
  const [workspaceDir, setWorkspaceDir] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [profile, setProfile] = useState<LearnerProfile>({ topics: {} });
  const [seedingPrerequisiteTopic, setSeedingPrerequisiteTopic] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState<boolean>(false);
  const [pendingDeleteDocId, setPendingDeleteDocId] = useState<string | null>(
    null
  );
  const [isDeletingDoc, setIsDeletingDoc] = useState<boolean>(false);

  const scrollPositionsRef = useRef<Record<string, number>>({});
  const documentRef = useRef<DocumentNode | null>(null);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  const applyDocResponse = (payload: DocApiResponse) => {
    setDocument(payload.document);
    if (payload.documents !== undefined) {
      setDocuments(payload.documents);
    } else if (payload.document) {
      setDocuments((prev) => ({
        ...prev,
        [payload.document!.id]: payload.document!,
      }));
    }
    setBlocks(payload.blocks);
    setToc(payload.toc);
    if (payload.activeChat !== undefined) {
      setActiveChat(payload.activeChat);
      setActiveChatBlockId(payload.activeChat?.blockId ?? null);
      if (payload.activeChat && payload.activeChat.blockId === null) {
        setIsDocChatOpen(true);
      }
    }
    if (payload.pendingEdits !== undefined) {
      setPendingEdits(payload.pendingEdits);
    }
    if (payload.settings) {
      setSettings(payload.settings);
      setModelId(payload.settings.modelId);
    } else if (payload.modelId) {
      setModelId(payload.modelId);
      setSettings((prev) => ({ ...prev, modelId: payload.modelId }));
    }
    if (payload.workspaceDir !== undefined) {
      setWorkspaceDir(payload.workspaceDir);
    }
    if (payload.workspaces !== undefined) {
      setWorkspaces(payload.workspaces);
    }
    if (payload.profile !== undefined) {
      setProfile(payload.profile);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchDoc() {
      try {
        const res = await fetch('/api/doc');
        if (!res.ok) {
          throw new Error(`Failed to load document (${res.status})`);
        }
        const data = (await res.json()) as DocApiResponse;
        if (!cancelled) {
          applyDocResponse(data);
          if (typeof window !== 'undefined' && data.document?.id) {
            window.history.replaceState(
              { docId: data.document.id },
              '',
              window.location.href
            );
            scrollPositionsRef.current[data.document.id] = window.scrollY;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setSeedError(
            err instanceof Error ? err.message : 'Failed to load workspace'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchDoc();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectDocument = async (
    docId: string,
    options?: { isPopState?: boolean }
  ) => {
    const isPopState = options?.isPopState ?? false;

    if (docId === documentRef.current?.id) {
      if (!isPopState) {
        scrollToPosition(0);
      }
      return;
    }

    if (documentRef.current?.id) {
      scrollPositionsRef.current[documentRef.current.id] = window.scrollY;
    }

    if (!isPopState && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('id', docId);
      window.history.pushState({ docId }, '', url.toString());
      scrollToPosition(0);
    }

    try {
      const res = await fetch(`/api/doc?id=${encodeURIComponent(docId)}`);
      if (!res.ok) {
        throw new Error(`Failed to load document (${res.status})`);
      }
      const data = (await res.json()) as DocApiResponse;
      applyDocResponse(data);
      setActiveChat(null);
      setActiveChatBlockId(null);
      setChatError(null);
      setIsDocChatOpen(false);
      setDocChatError(null);

      if (isPopState) {
        const savedY = scrollPositionsRef.current[docId] ?? 0;
        restoreScroll(savedY);
      } else {
        restoreScroll(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectSearchResult = async (docId: string, blockId: string) => {
    if (docId !== documentRef.current?.id) {
      await handleSelectDocument(docId);
    }
    const scrollToBlock = () => {
      const el = globalThis.document?.getElementById(`block-${blockId}`);
      if (el) {
        el.scrollIntoView?.({ behavior: 'smooth' });
        return true;
      }
      return false;
    };
    if (!scrollToBlock()) {
      setTimeout(() => {
        scrollToBlock();
      }, 0);
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (documentRef.current?.id) {
        scrollPositionsRef.current[documentRef.current.id] = window.scrollY;
      }

      const targetDocId =
        (event.state as { docId?: string } | null)?.docId ??
        new URLSearchParams(window.location.search).get('id') ??
        'index';

      void handleSelectDocument(targetDocId, { isPopState: true });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleUpdateSettings = async (patch: Partial<NotebookSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    if (patch.modelId !== undefined) {
      setModelId(patch.modelId);
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          settings?: NotebookSettings;
          modelId?: string;
        };
        if (data.settings) {
          setSettings(data.settings);
          setModelId(data.settings.modelId);
        } else if (data.modelId) {
          setModelId(data.modelId);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSwitchWorkspace = async (targetWorkspaceDir: string) => {
    try {
      const res = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceDir: targetWorkspaceDir }),
      });
      if (!res.ok) {
        throw new Error(`Failed to switch workspace (${res.status})`);
      }
      const data = (await res.json()) as DocApiResponse;
      applyDocResponse(data);
      setActiveChat(null);
      setActiveChatBlockId(null);
      setChatError(null);
      setIsDocChatOpen(false);
      setDocChatError(null);
      scrollPositionsRef.current = {};
      if (data.document?.id && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('id', data.document.id);
        window.history.pushState({ docId: data.document.id }, '', url.toString());
        restoreScroll(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePrerequisiteKnown = async (
    topic: string,
    nextStatus: TopicFamiliarity
  ) => {
    setProfile((prev) => ({
      ...prev,
      topics: {
        ...prev.topics,
        [topic]: nextStatus,
      },
    }));

    try {
      const res = await fetch('/api/profile/topics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, status: nextStatus }),
      });
      if (res.ok) {
        const data = (await res.json()) as { profile?: LearnerProfile };
        if (data.profile) {
          setProfile(data.profile);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeedPrerequisite = async (topic: string) => {
    setSeedingPrerequisiteTopic(topic);
    if (documentRef.current?.id) {
      scrollPositionsRef.current[documentRef.current.id] = window.scrollY;
    }
    try {
      const res = await fetch('/api/prerequisites/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          parentDocId: document?.id ?? 'index',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as DocApiResponse;
        applyDocResponse(data);
        setActiveChat(null);
        setActiveChatBlockId(null);
        setChatError(null);
        if (data.document?.id && typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('id', data.document.id);
          window.history.pushState({ docId: data.document.id }, '', url.toString());
          restoreScroll(0);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSeedingPrerequisiteTopic(null);
    }
  };

  const handleSeed = async (prompt: string) => {
    setIsSeeding(true);
    setSeedError(null);

    try {
      const res = await fetch('/api/doc/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to seed topic (${res.status})`);
      }

      applyDocResponse(data as DocApiResponse);
      setIsSeedModalOpen(false);
      const doc = (data as DocApiResponse).document;
      if (doc?.id && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('id', doc.id);
        window.history.pushState({ docId: doc.id }, '', url.toString());
        restoreScroll(0);
      }
    } catch (err) {
      setSeedError(
        err instanceof Error ? err.message : 'Failed to seed topic'
      );
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteDocument = (docId: string) => {
    setPendingDeleteDocId(docId);
  };

  const confirmDeleteDocument = async () => {
    if (!pendingDeleteDocId || isDeletingDoc) {
      return;
    }
    const docId = pendingDeleteDocId;
    setIsDeletingDoc(true);
    try {
      const res = await fetch(`/api/doc/${encodeURIComponent(docId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as DocApiResponse;
      delete scrollPositionsRef.current[docId];
      applyDocResponse(data);
      setPendingDeleteDocId(null);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (data.document?.id) {
          url.searchParams.set('id', data.document.id);
          window.history.pushState(
            { docId: data.document.id },
            '',
            url.toString()
          );
          restoreScroll(0);
        } else {
          url.searchParams.delete('id');
          window.history.pushState({}, '', url.toString());
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeletingDoc(false);
    }
  };

  const handleUpdateBlock = async (blockId: string, markdown: string) => {
    const res = await fetch(`/api/blocks/${encodeURIComponent(blockId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, docId: document?.id ?? 'index' }),
    });
    if (res.ok) {
      const data = (await res.json()) as DocApiResponse;
      applyDocResponse(data);
    }
  };

  const handleSplitBlock = async (blockId: string) => {
    const res = await fetch(
      `/api/blocks/${encodeURIComponent(blockId)}/split`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: document?.id ?? 'index' }),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as DocApiResponse;
      applyDocResponse(data);
    }
  };

  const handleMergeBlock = async (blockId: string) => {
    const res = await fetch(
      `/api/blocks/${encodeURIComponent(blockId)}/merge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: document?.id ?? 'index' }),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as DocApiResponse;
      applyDocResponse(data);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    const res = await fetch(`/api/blocks/${encodeURIComponent(blockId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = (await res.json()) as DocApiResponse;
      applyDocResponse(data);
    }
  };

  const handleOpenChat = (blockId: string) => {
    if (pendingEdits.length > 0) {
      return;
    }
    setChatError(null);
    setActiveChatBlockId(blockId);
    if (activeChat && activeChat.blockId !== blockId) {
      setActiveChat(null);
    }
  };

  const handleSendChatMessage = async (blockId: string, message: string) => {
    setIsSendingChat(true);
    setChatError(null);

    try {
      const res = await fetch(
        `/api/blocks/${encodeURIComponent(blockId)}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            docId: document?.id ?? 'index',
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to send message (${res.status})`);
      }

      setActiveChat(data.activeChat as EphemeralChatThread);
      setActiveChatBlockId(blockId);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Failed to send chat message'
      );
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleDiscardChat = async (blockId: string) => {
    setChatError(null);
    try {
      await fetch(`/api/blocks/${encodeURIComponent(blockId)}/chat`, {
        method: 'DELETE',
      });
    } finally {
      setActiveChat(null);
      setActiveChatBlockId(null);
    }
  };

  const handleIntegrateChat = async (blockId: string) => {
    setIsIntegratingChat(true);
    setChatError(null);

    try {
      const res = await fetch(
        `/api/blocks/${encodeURIComponent(blockId)}/integrate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: document?.id ?? 'index' }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to integrate chat (${res.status})`);
      }

      applyDocResponse(data as DocApiResponse);
      setActiveChat(null);
      setActiveChatBlockId(null);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Failed to integrate chat'
      );
    } finally {
      setIsIntegratingChat(false);
    }
  };

  const handleBranchChat = async (blockId: string) => {
    setIsBranchingChat(true);
    setChatError(null);
    if (documentRef.current?.id) {
      scrollPositionsRef.current[documentRef.current.id] = window.scrollY;
    }

    try {
      const res = await fetch(
        `/api/blocks/${encodeURIComponent(blockId)}/branch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: document?.id ?? 'index' }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ?? `Failed to branch sub-document (${res.status})`
        );
      }

      applyDocResponse(data as DocApiResponse);
      setActiveChat(null);
      setActiveChatBlockId(null);
      const doc = (data as DocApiResponse).document;
      if (doc?.id && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('id', doc.id);
        window.history.pushState({ docId: doc.id }, '', url.toString());
        restoreScroll(0);
      }
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Failed to branch sub-document'
      );
    } finally {
      setIsBranchingChat(false);
    }
  };

  const handleToggleDocChat = () => {
    if (pendingEdits.length > 0) {
      return;
    }
    setDocChatError(null);
    setIsDocChatOpen((prev) => {
      const next = !prev;
      if (next && activeChatBlockId !== null) {
        setActiveChatBlockId(null);
      }
      return next;
    });
  };

  const handleSendDocChatMessage = async (message: string) => {
    setIsSendingDocChat(true);
    setDocChatError(null);

    try {
      const res = await fetch('/api/doc/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          docId: document?.id ?? 'index',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to send message (${res.status})`);
      }

      setActiveChat(data.activeChat as EphemeralChatThread);
      setActiveChatBlockId(null);
      setIsDocChatOpen(true);
    } catch (err) {
      setDocChatError(
        err instanceof Error ? err.message : 'Failed to send notebook message'
      );
    } finally {
      setIsSendingDocChat(false);
    }
  };

  const handleDiscardDocChat = async () => {
    setDocChatError(null);
    try {
      await fetch(
        `/api/doc/chat?docId=${encodeURIComponent(document?.id ?? 'index')}`,
        {
          method: 'DELETE',
        }
      );
    } finally {
      setActiveChat(null);
      setActiveChatBlockId(null);
      setIsDocChatOpen(false);
    }
  };

  const handleIntegrateDocChat = async () => {
    setIsIntegratingDocChat(true);
    setDocChatError(null);

    try {
      const res = await fetch('/api/doc/integrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: document?.id ?? 'index' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ?? `Failed to integrate notebook chat (${res.status})`
        );
      }

      applyDocResponse(data as DocApiResponse);
      setActiveChat(null);
      setActiveChatBlockId(null);
      setIsDocChatOpen(false);
    } catch (err) {
      setDocChatError(
        err instanceof Error ? err.message : 'Failed to integrate notebook chat'
      );
    } finally {
      setIsIntegratingDocChat(false);
    }
  };

  const handleBranchDocChat = async () => {
    setIsBranchingDocChat(true);
    setDocChatError(null);
    if (documentRef.current?.id) {
      scrollPositionsRef.current[documentRef.current.id] = window.scrollY;
    }

    try {
      const res = await fetch('/api/doc/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: document?.id ?? 'index' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ?? `Failed to branch notebook chat (${res.status})`
        );
      }

      applyDocResponse(data as DocApiResponse);
      setActiveChat(null);
      setActiveChatBlockId(null);
      setIsDocChatOpen(false);
      const doc = (data as DocApiResponse).document;
      if (doc?.id && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('id', doc.id);
        window.history.pushState({ docId: doc.id }, '', url.toString());
        restoreScroll(0);
      }
    } catch (err) {
      setDocChatError(
        err instanceof Error ? err.message : 'Failed to branch sub-document'
      );
    } finally {
      setIsBranchingDocChat(false);
    }
  };

  const handleAcceptEdit = async (editId: string) => {
    try {
      const res = await fetch(
        `/api/edits/${encodeURIComponent(editId)}/accept`,
        {
          method: 'POST',
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to accept edit (${res.status})`);
      }
      applyDocResponse(data as DocApiResponse);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectEdit = async (editId: string) => {
    try {
      const res = await fetch(
        `/api/edits/${encodeURIComponent(editId)}/reject`,
        {
          method: 'POST',
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to reject edit (${res.status})`);
      }
      applyDocResponse(data as DocApiResponse);
    } catch (err) {
      console.error(err);
    }
  };

  const handleJumpToNextDiff = () => {
    const firstEdit = pendingEdits[0];
    if (firstEdit) {
      const el = globalThis.document?.getElementById(`block-${firstEdit.blockId}`);
      el?.scrollIntoView?.({ behavior: 'smooth' });
    }
  };

  const ancestorChain: DocumentNode[] = [];
  if (document) {
    let currParentId = document.parentId;
    const visited = new Set<string>();
    while (currParentId && !visited.has(currParentId)) {
      visited.add(currParentId);
      const parentDoc = documents[currParentId];
      if (!parentDoc) {
        break;
      }
      ancestorChain.unshift(parentDoc);
      currParentId = parentDoc.parentId;
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#FAF8F5',
        color: '#18181B',
      }}
    >
      <SidebarTree
        document={document}
        documents={documents}
        toc={toc}
        modelId={modelId}
        settings={settings}
        workspaceDir={workspaceDir}
        workspaces={workspaces}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onOpenSeedModal={() => setIsSeedModalOpen(true)}
        onSelectDocument={(docId) => void handleSelectDocument(docId)}
        onSelectSearchResult={(docId, blockId) =>
          void handleSelectSearchResult(docId, blockId)
        }
        onDeleteDocument={(docId) => void handleDeleteDocument(docId)}
        onUpdateSettings={(patch) => void handleUpdateSettings(patch)}
        onSwitchWorkspace={(dir) => void handleSwitchWorkspace(dir)}
      />

      <main
        style={{
          flex: 1,
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      >
        <div style={{ width: '100%', maxWidth: '720px', minWidth: 0 }}>
          {isLoading ? (
            <div
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '14px',
                color: '#65635E',
              }}
            >
              Loading workspace...
            </div>
          ) : !document || blocks.length === 0 ? (
            <SeedModal
              mode="inline"
              isSubmitting={isSeeding}
              error={seedError}
              onSeed={handleSeed}
              documents={documents}
              onSelectDocument={(docId) => void handleSelectDocument(docId)}
              onDeleteDocument={handleDeleteDocument}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
            />
          ) : (
            <>
              <header style={{ marginBottom: '32px' }}>
                {ancestorChain.length > 0 && (
                  <nav
                    aria-label="Document Breadcrumbs"
                    data-testid="document-breadcrumbs"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '6px',
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: '13px',
                      color: '#65635E',
                      marginBottom: '8px',
                    }}
                  >
                    {ancestorChain.map((anc) => (
                      <React.Fragment key={anc.id}>
                        <button
                          type="button"
                          onClick={() => void handleSelectDocument(anc.id)}
                          title={anc.title}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontFamily: "'Inter', system-ui, sans-serif",
                            fontSize: '13px',
                            color: '#1D4ED8',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {getConciseTitle(anc.title, anc.shortTitle)}
                        </button>
                        <span aria-hidden="true">/</span>
                      </React.Fragment>
                    ))}
                    <span title={document.title} style={{ color: '#18181B', fontWeight: 500 }}>
                      {getConciseTitle(document.title, document.shortTitle)}
                    </span>
                  </nav>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '12px',
                    color: '#65635E',
                    marginBottom: '8px',
                  }}
                >
                  <span>{document.filename}</span>
                  <button
                    type="button"
                    aria-label="Delete current notebook"
                    onClick={() => void handleDeleteDocument(document.id)}
                    style={{
                      backgroundColor: 'transparent',
                      color: '#B91C1C',
                      border: '1px solid #FECACA',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete Notebook
                  </button>
                </div>
                <h1
                  style={{
                    fontFamily: "'Newsreader', 'Charter', 'Georgia', serif",
                    fontSize: '28px',
                    color: '#18181B',
                    margin: 0,
                  }}
                >
                  {document.title}
                </h1>
              </header>

              {pendingEdits.length > 0 && (
                <GateBanner
                  pendingEdits={pendingEdits}
                  onJumpToNextDiff={handleJumpToNextDiff}
                />
              )}

              <section aria-label="Concept Blocks">
                {blocks.map((block, idx) => {
                  const isChatOpen = activeChatBlockId === block.id;
                  const chatMessages =
                    activeChat && activeChat.blockId === block.id
                      ? activeChat.messages
                      : [];
                  const pendingEdit =
                    pendingEdits.find((e) => e.blockId === block.id) ?? null;
                  const childDocs = Object.values(documents).filter(
                    (d) =>
                      d.parentId === document.id && d.parentBlockId === block.id
                  );

                  return (
                    <ConceptBlockCard
                      key={block.id}
                      block={block}
                      isFirstBlock={idx === 0}
                      canMerge={idx < blocks.length - 1}
                      isChatOpen={isChatOpen}
                      chatMessages={chatMessages}
                      isSendingChat={isChatOpen && isSendingChat}
                      isIntegratingChat={isChatOpen && isIntegratingChat}
                      isBranchingChat={isChatOpen && isBranchingChat}
                      chatError={isChatOpen ? chatError : null}
                      isChatLocked={pendingEdits.length > 0}
                      askCellDisabled={pendingEdits.length > 0}
                      pendingEdit={pendingEdit}
                      childDocuments={childDocs}
                      documents={documents}
                      prerequisites={
                        block.id === 'blk_00'
                          ? document.prerequisites
                          : undefined
                      }
                      prerequisiteDocIds={
                        block.id === 'blk_00'
                          ? document.prerequisiteDocIds
                          : undefined
                      }
                      learnerProfile={profile}
                      seedingPrerequisiteTopic={seedingPrerequisiteTopic}
                      onSelectDocument={(docId) =>
                        void handleSelectDocument(docId)
                      }
                      onTogglePrerequisiteKnown={handleTogglePrerequisiteKnown}
                      onSeedPrerequisite={handleSeedPrerequisite}
                      onOpenChat={handleOpenChat}
                      onSendChatMessage={handleSendChatMessage}
                      onIntegrateChat={handleIntegrateChat}
                      onBranchChat={handleBranchChat}
                      onDiscardChat={handleDiscardChat}
                      onAcceptEdit={handleAcceptEdit}
                      onRejectEdit={handleRejectEdit}
                      onUpdateMarkdown={handleUpdateBlock}
                      onSplitBlock={handleSplitBlock}
                      onMergeBlock={handleMergeBlock}
                      onDeleteBlock={handleDeleteBlock}
                    />
                  );
                })}
              </section>
            </>
          )}
        </div>

        {document && blocks.length > 0 && (
          <DocumentChatDrawer
            documentTitle={document.title}
            isOpen={isDocChatOpen}
            messages={
              activeChat && activeChat.blockId === null
                ? activeChat.messages
                : []
            }
            isSending={isSendingDocChat}
            isIntegrating={isIntegratingDocChat}
            isBranching={isBranchingDocChat}
            isChatLocked={pendingEdits.length > 0}
            error={docChatError}
            onToggleOpen={handleToggleDocChat}
            onSendMessage={handleSendDocChatMessage}
            onIntegrate={handleIntegrateDocChat}
            onBranch={handleBranchDocChat}
            onDiscard={handleDiscardDocChat}
          />
        )}
      </main>

      {isSeedModalOpen && (
        <SeedModal
          mode="modal"
          isSubmitting={isSeeding}
          error={seedError}
          onSeed={handleSeed}
          documents={documents}
          onSelectDocument={(docId) => {
            void handleSelectDocument(docId);
            setIsSeedModalOpen(false);
          }}
          onDeleteDocument={handleDeleteDocument}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setIsSeedModalOpen(false)}
        />
      )}

      {pendingDeleteDocId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Delete Notebook"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(24, 24, 27, 0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 60,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4DFD7',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 4px 12px rgba(24, 24, 27, 0.12)',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            <h3
              style={{
                fontFamily: "'Newsreader', 'Charter', 'Georgia', serif",
                fontSize: '20px',
                color: '#18181B',
                marginTop: 0,
                marginBottom: '8px',
              }}
            >
              Delete Notebook?
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: '#65635E',
                marginTop: 0,
                marginBottom: '20px',
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to permanently delete{' '}
              <strong style={{ color: '#18181B' }}>
                {documents[pendingDeleteDocId]?.title ??
                  (document?.id === pendingDeleteDocId
                    ? document.title
                    : pendingDeleteDocId)}
              </strong>{' '}
              ({documents[pendingDeleteDocId]?.filename ?? `${pendingDeleteDocId}.md`})
              {(documents[pendingDeleteDocId]?.childDocIds?.length ?? 0) > 0
                ? ` and its ${documents[pendingDeleteDocId]!.childDocIds.length} child sub-document(s)`
                : ''}
              ? This action cannot be undone.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                disabled={isDeletingDoc}
                onClick={() => setPendingDeleteDocId(null)}
                style={{
                  backgroundColor: '#FAF8F5',
                  color: '#18181B',
                  border: '1px solid #E4DFD7',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingDoc}
                onClick={() => void confirmDeleteDocument()}
                style={{
                  backgroundColor: '#B91C1C',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: isDeletingDoc ? 'wait' : 'pointer',
                }}
              >
                {isDeletingDoc ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
