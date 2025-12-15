import { useState, useRef, useEffect } from 'react';
import { useMindMapStore } from '@/store/mindmap.store';
import { chatService } from '@/services/chat.service';
import type { MindMapContext, MindMapNode } from '@/types/mindmap.types';

export const ChatPanel: React.FC = () => {
  const {
    chatHistory,
    addChatMessage,
    selectedNodeId,
    getNodeById,
    getParentNode,
    getChildNodes,
    isAIThinking,
    setAIThinking,
    addNode,
    addEdge,
    setSelectedNode,
    data,
    applyLayout,
  } = useMindMapStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-create and select root node on first interaction
  useEffect(() => {
    if (data.nodes.length === 0 && chatHistory.length === 0) {
      const rootId = 'root-node';
      const rootNode: MindMapNode = {
        id: rootId,
        type: 'root',
        label: 'Project',
        description: 'Root node - describe your project to create features',
        parent_id: null,
        metadata: {
          status: 'planned',
          archon_project_id: null,
          archon_task_ids: [],
          commands: [],
          expanded: true,
        },
        position: { x: 250, y: 50 },
      };
      addNode(rootNode);
      setSelectedNode(rootId);
    }
  }, [data.nodes.length, chatHistory.length, addNode, setSelectedNode]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const buildContext = (): MindMapContext => {
    const currentNode = selectedNodeId ? getNodeById(selectedNodeId) : null;
    const parentNode = currentNode ? getParentNode(currentNode.id) : null;
    const childNodes = currentNode ? getChildNodes(currentNode.id) : [];
    const siblingNodes = parentNode ? getChildNodes(parentNode.id) : [];

    return {
      currentNode: currentNode || null,
      parentNode: parentNode || null,
      childNodes,
      siblingNodes,
    };
  };

  const handleSend = async (): Promise<void> => {
    if (!input.trim()) return;

    const userMessage = {
      role: 'user' as const,
      content: input,
      timestamp: new Date().toISOString(),
    };
    addChatMessage(userMessage);
    setInput('');
    setAIThinking(true);

    const context = buildContext();
    let fullResponse = '';

    try {
      // Convert chat history to format expected by service (filter out system messages)
      const historyForAI = chatHistory
        .filter((msg): msg is { role: 'user' | 'assistant'; content: string; timestamp: string } =>
          msg.role === 'user' || msg.role === 'assistant'
        )
        .map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

      // Stream response with conversation history
      for await (const chunk of chatService.streamResponse(input, context, historyForAI)) {
        fullResponse += chunk;
      }

      // Debug: Log the full response to console
      console.log('[ChatPanel] Full AI response:', fullResponse);

      // Check if response contains node creation command (handle both code blocks and raw JSON)
      let nodeCreationCommand = null;
      let jsonToRemove = '';

      // Try to extract JSON from code block first
      const codeBlockMatch = fullResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          nodeCreationCommand = JSON.parse(codeBlockMatch[1]);
          jsonToRemove = codeBlockMatch[0];
        } catch (e) {
          console.error('Failed to parse JSON from code block:', e);
        }
      }

      // If no code block, try to find raw JSON
      if (!nodeCreationCommand) {
        const rawJsonMatch = fullResponse.match(/\{[\s\S]*?"action"\s*:\s*"create_nodes"[\s\S]*?\}/);
        if (rawJsonMatch) {
          try {
            nodeCreationCommand = JSON.parse(rawJsonMatch[0]);
            jsonToRemove = rawJsonMatch[0];
          } catch (e) {
            console.error('Failed to parse raw JSON:', e);
          }
        }
      }

      // Process node creation if we found valid JSON
      if (nodeCreationCommand?.action === 'create_nodes' && Array.isArray(nodeCreationCommand.nodes)) {
        console.log('[ChatPanel] Creating nodes:', nodeCreationCommand.nodes);
        const parentId = selectedNodeId || null;

        nodeCreationCommand.nodes.forEach((nodeData: { label: string; description: string }) => {
          const newNodeId = `node-${Date.now()}-${Math.random()}`;
          const newNode: MindMapNode = {
            id: newNodeId,
            type: 'feature',
            label: nodeData.label,
            description: nodeData.description,
            parent_id: parentId,
            metadata: {
              status: 'planned',
              archon_project_id: null,
              archon_task_ids: [],
              commands: [],
              expanded: false,
            },
            position: {
              x: Math.random() * 400,
              y: Math.random() * 400,
            },
          };
          addNode(newNode);

          // Create edge if there's a parent
          if (parentId) {
            addEdge({
              id: `edge-${parentId}-${newNodeId}`,
              source: parentId,
              target: newNodeId,
              type: 'parent-child',
            });
          }
        });

        // Apply tree layout to arrange nodes
        applyLayout();

        // Clean response (remove JSON command)
        fullResponse = fullResponse.replace(jsonToRemove, '').trim();
        if (fullResponse) {
          fullResponse = `✅ Created ${nodeCreationCommand.nodes.length} child node(s)\n\n${fullResponse}`;
        } else {
          fullResponse = `✅ Created ${nodeCreationCommand.nodes.length} child node(s)`;
        }
      }

      const aiMessage = {
        role: 'assistant' as const,
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(aiMessage);
    } catch (error) {
      const errorMessage = {
        role: 'system' as const,
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      };
      addChatMessage(errorMessage);
    } finally {
      setAIThinking(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold">AI Planning Assistant</h2>
        {selectedNodeId && (
          <p className="text-sm text-gray-600">Focused on: {getNodeById(selectedNodeId)?.label}</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : msg.role === 'assistant'
                    ? 'bg-white border border-gray-200'
                    : 'bg-red-100 text-red-800'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {isAIThinking && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-500">AI is thinking...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Describe your feature or ask a question..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isAIThinking}
          />
          <button
            onClick={handleSend}
            disabled={isAIThinking || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
