import React, { useEffect, useState } from 'react';
import type {
  ConceptBlock,
  DocumentNode,
  EphemeralChatThread,
  LearnerProfile,
  NotebookSettings,
  PendingSuggestedEdit,
  TocItem,
  TopicFamiliarity,
} from '../shared/schema.js';
import { ConceptBlockCard } from './components/ConceptBlockCard.js';
import { GateBanner } from './components/GateBanner.js';
import { SeedModal } from './components/SeedModal.js';
import { SidebarTree } from './components/SidebarTree.js';

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

  const handleSelectDocument = async (docId: string) => {
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
    } catch (err) {
      console.error(err);
    }
  };

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
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePrerequisiteKnown = async (
    topic: string,
    nextStatus: TopicFamiliarity
  ) => {
    setProfile((prev) => ({
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
    } catch (err) {
      setSeedError(
        err instanceof Error ? err.message : 'Failed to seed topic'
      );
    } finally {
      setIsSeeding(false);
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
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Failed to branch sub-document'
      );
    } finally {
      setIsBranchingChat(false);
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
        }}
      >
        <div style={{ width: '100%', maxWidth: '720px' }}>
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
                          {anc.title}
                        </button>
                        <span aria-hidden="true">/</span>
                      </React.Fragment>
                    ))}
                    <span style={{ color: '#18181B', fontWeight: 500 }}>
                      {document.title}
                    </span>
                  </nav>
                )}
                <div
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '12px',
                    color: '#65635E',
                    marginBottom: '8px',
                  }}
                >
                  {document.filename}
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
                      prerequisites={
                        block.id === 'blk_00'
                          ? document.prerequisites
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
      </main>

      {isSeedModalOpen && (
        <SeedModal
          mode="modal"
          isSubmitting={isSeeding}
          error={seedError}
          onSeed={handleSeed}
          onClose={() => setIsSeedModalOpen(false)}
        />
      )}
    </div>
  );
}
