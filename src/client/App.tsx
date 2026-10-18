import React, { useEffect, useState } from 'react';
import type {
  ConceptBlock,
  DocumentNode,
  EphemeralChatThread,
  PendingSuggestedEdit,
  TocItem,
} from '../shared/schema.js';
import { ConceptBlockCard } from './components/ConceptBlockCard.js';
import { SeedModal } from './components/SeedModal.js';
import { SidebarTree } from './components/SidebarTree.js';

interface DocApiResponse {
  document: DocumentNode | null;
  blocks: ConceptBlock[];
  toc: TocItem[];
  activeChat?: EphemeralChatThread | null;
  pendingEdits?: PendingSuggestedEdit[];
  modelId: string;
}

export function App(): React.ReactElement {
  const [document, setDocument] = useState<DocumentNode | null>(null);
  const [blocks, setBlocks] = useState<ConceptBlock[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeChat, setActiveChat] = useState<EphemeralChatThread | null>(null);
  const [activeChatBlockId, setActiveChatBlockId] = useState<string | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingSuggestedEdit[]>([]);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>('anthropic:claude-opus-4-6');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState<boolean>(false);

  const applyDocResponse = (payload: DocApiResponse) => {
    setDocument(payload.document);
    setBlocks(payload.blocks);
    setToc(payload.toc);
    if (payload.activeChat !== undefined) {
      setActiveChat(payload.activeChat);
      setActiveChatBlockId(payload.activeChat?.blockId ?? null);
    }
    if (payload.pendingEdits !== undefined) {
      setPendingEdits(payload.pendingEdits);
    }
    if (payload.modelId) {
      setModelId(payload.modelId);
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
        toc={toc}
        modelId={modelId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onOpenSeedModal={() => setIsSeedModalOpen(true)}
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

              <section aria-label="Concept Blocks">
                {blocks.map((block, idx) => {
                  const isChatOpen = activeChatBlockId === block.id;
                  const chatMessages =
                    activeChat && activeChat.blockId === block.id
                      ? activeChat.messages
                      : [];

                  return (
                    <ConceptBlockCard
                      key={block.id}
                      block={block}
                      canMerge={idx < blocks.length - 1}
                      isChatOpen={isChatOpen}
                      chatMessages={chatMessages}
                      isSendingChat={isChatOpen && isSendingChat}
                      chatError={isChatOpen ? chatError : null}
                      askCellDisabled={pendingEdits.length > 0}
                      onOpenChat={handleOpenChat}
                      onSendChatMessage={handleSendChatMessage}
                      onDiscardChat={handleDiscardChat}
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
