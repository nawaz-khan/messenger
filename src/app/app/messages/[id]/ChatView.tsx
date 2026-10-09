'use client'

import { useState, useRef, useEffect } from 'react'
import { sendMessage, sendMediaMessage, editMessage, deleteMessage, markConversationRead } from '@/app/app/messages/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { Paperclip, X, MoreVertical, Check, CheckCheck } from 'lucide-react'
import { processMediaFile, uploadToDrive } from '@/lib/media'
import { MediaRenderer } from '@/components/media/MediaRenderer'
import GroupSettingsDialog from './GroupSettingsDialog'
import Link from 'next/link'
import { MessageReportDialog } from './MessageReportDialog'

export default function ChatView({
  conversationId,
  conversationType,
  initialMessages,
  currentUserId,
  otherProfile,
  group,
  groupMembers,
  currentUserRole,
  initialIsBlocked,
}: {
  conversationId: string
  conversationType?: string
  initialMessages: any[]
  currentUserId: string
  otherProfile?: any
  group?: any
  groupMembers?: any[]
  currentUserRole?: string
  initialIsBlocked?: boolean
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [readReceipts, setReadReceipts] = useState<Record<string, boolean>>({})
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false)
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<'top' | 'bottom'>('bottom')
  const [reportingMessage, setReportingMessage] = useState<any>(null)

  // Media state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (e.target instanceof Element && !e.target.closest('.message-action-menu-container')) {
        setActiveActionMenu(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    console.log('[READ DEBUG 1] CHAT OPENED', conversationId)

    const markRead = async () => {
      if (conversationType === 'direct') {
        console.log('[READ DEBUG 2] CALLING MARK READ', conversationId)
        const { error } = await supabase.rpc('mark_conversation_read', { conv_id: conversationId })
        if (error) {
          console.error('[READ DEBUG 3] MARK READ RESULT ERROR', error)
        } else {
          console.log('[READ DEBUG 3] MARK READ RESULT SUCCESS', conversationId)
        }
      }
    }
    markRead()

    // Fetch initial read receipts for the entire conversation
    const fetchReceipts = async () => {
      if (conversationType !== 'direct') return
      const { data, error } = await supabase
        .from('message_read_receipts')
        .select('message_id')
        .eq('conversation_id', conversationId)
      
      if (data) {
        const map: Record<string, boolean> = {}
        data.forEach(r => { map[r.message_id] = true })
        setReadReceipts(map)
      } else if (error) {
        console.error('[READ] Fetch receipts error:', error)
      }
    }
    fetchReceipts()

    console.log('[READ DEBUG 4] SUBSCRIBING', conversationId)
    const channelName = `conversation:${conversationId}`
    const channel = supabase.channel(channelName, {
      config: {
        private: true
      }
    })

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          // If the message has media, fetch the media record
          let message = payload.new as any;
          if (message.has_media) {
            const { data: mediaRecords } = await supabase
              .from('message_media')
              .select('*')
              .eq('message_id', message.id)
            message.message_media = mediaRecords || [];
          }

          setMessages((prev) => {
            if (prev.find((msg) => msg.id === message.id)) return prev
            const newArray = [...prev, message]
            newArray.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            return newArray
          })
          
          if (conversationType === 'direct' && message.sender_id !== currentUserId) {
            markRead()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === payload.new.id ? { ...msg, ...payload.new } : msg))
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_read_receipts',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          console.log('[READ DEBUG 6] RECEIPT RECEIVED', payload)
          if (payload.new && payload.new.message_id) {
            console.log('[READ DEBUG 7] SETTING READ', payload.new.message_id)
            setReadReceipts(prev => ({ ...prev, [payload.new.message_id]: true }))
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        let isOnline = false
        for (const presenceArray of Object.values(state)) {
          for (const presence of presenceArray as any[]) {
            if (presence.user_id !== currentUserId) {
              isOnline = true
              break
            }
          }
          if (isOnline) break
        }
        setIsOtherUserOnline(isOnline)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[READ DEBUG 5] REALTIME SUBSCRIBED', conversationId)
          await channel.track({
            user_id: currentUserId,
            online_at: new Date().toISOString()
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, currentUserId, conversationType, supabase])

  const handleSend = async () => {
    if ((!input.trim() && !selectedFile) || isSending) return
    setIsSending(true)
    setUploadProgress(0)

    try {
      let driveFileId: string | null = null;
      let previewDriveFileId: string | null = null;
      let mediaMeta: any = null;

      // Handle media upload first
      if (selectedFile) {
        const processed = await processMediaFile(selectedFile);
        mediaMeta = processed;
        
        if (processed.mediaType === 'IMAGE' && processed.previewFile) {
          // For images, we only upload the compressed file and treat it as the primary media
          console.log(`[PERF] Original image size: ${processed.file.size} bytes`);
          console.log(`[PERF] Uploading compressed image size: ${processed.previewFile.size} bytes`);
          
          driveFileId = await uploadToDrive(
            processed.previewFile,
            conversationId,
            processed.mediaType,
            (prog) => setUploadProgress(prog)
          );
          
          // Update mediaMeta to reflect that the stored file is the compressed one
          mediaMeta.file = processed.previewFile;
        } else {
          // For video/GIF or if image compression failed, upload the original file
          driveFileId = await uploadToDrive(
            processed.file, 
            conversationId, 
            processed.mediaType,
            (prog) => setUploadProgress(prog)
          );

          // Upload preview if generated (e.g. video thumbnails)
          if (processed.previewFile) {
            previewDriveFileId = await uploadToDrive(
              processed.previewFile,
              conversationId,
              processed.mediaType
            );
          }
        }
      }

      const dbStart = performance.now();
      let completeMsg;

      if (selectedFile && driveFileId && mediaMeta) {
        const result = await sendMediaMessage(
          conversationId, 
          input, 
          {
            driveFileId,
            previewDriveFileId: previewDriveFileId || undefined,
            mediaType: mediaMeta.mediaType,
            mimeType: mediaMeta.file.type,
            originalFilename: mediaMeta.file.name,
            fileSize: mediaMeta.file.size
          }
        );
        
        if (!result || !result.success || !result.data) {
          console.error("[MEDIA] sendMediaMessage returned error:", result?.error);
          throw new Error(result?.error || "Media message creation failed");
        }
        completeMsg = result.data;
      } else {
        const newMsg = await sendMessage(conversationId, input, false);
        if (!newMsg) {
          throw new Error("Text message creation failed (returned undefined)");
        }
        completeMsg = { ...newMsg, message_media: [] };
      }
      
      if (!completeMsg || !completeMsg.id) {
        throw new Error("Message creation returned invalid result");
      }

      const dbEnd = performance.now();
      console.log(`[PERF] Client total Supabase/Action wait: ${(dbEnd - dbStart).toFixed(2)} ms`);

      setMessages((prev) => {
        if (prev.find((msg) => msg.id === completeMsg.id)) return prev
        return [...prev, completeMsg]
      })

      setInput('')
      setSelectedFile(null)
      setUploadProgress(0)
      if (conversationType === 'direct') {
        markConversationRead(conversationId)
      }
    } catch (error: any) {
      console.error(error)
      alert(`Failed to send message: ${error.message}`)
    } finally {
      setIsSending(false)
      setUploadProgress(0)
    }
  }

  const handleEditSubmit = async (messageId: string) => {
    if (!editContent.trim()) return
    try {
      await editMessage(messageId, editContent)
      setEditingMessageId(null)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: editContent, edited_at: new Date().toISOString() }
            : msg
        )
      )
    } catch (error) {
      console.error(error)
      alert('Failed to edit message')
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return
    try {
      await deleteMessage(messageId)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: null, deleted_at: new Date().toISOString() }
            : msg
        )
      )
    } catch (error) {
      console.error(error)
      alert('Failed to delete message')
    }
  }

  return (
    <>
      <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
        <div className="h-16 border-b dark:border-slate-800 flex items-center px-6 shrink-0 bg-white dark:bg-slate-950 w-full justify-between">
        <div className="flex items-center">
          {conversationType === 'group' ? (
            <>
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <span className="text-blue-500">👥</span>
                {group?.name || 'Unnamed Group'}
              </h2>
              <span className="ml-2 text-sm text-slate-500 capitalize px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full">{group?.privacy || 'public'}</span>
            </>
          ) : (
            <>
              {otherProfile ? (
                <Link 
                  href={`/app/profile/${otherProfile.username}`} 
                  className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80"
                >
                  <h2 className="font-semibold text-lg hover:underline underline-offset-2">
                    {otherProfile.display_name}
                  </h2>
                  <span className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                    @{otherProfile.username}
                  </span>
                </Link>
              ) : (
                <h2 className="font-semibold text-lg">Conversation</h2>
              )}
              {otherProfile && (
                <div className="ml-4 flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${isOtherUserOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <span className="text-xs text-slate-500">{isOtherUserOnline ? 'Online' : 'Offline'}</span>
                </div>
              )}
            </>
          )}
        </div>

        {conversationType === 'group' && groupMembers && currentUserRole && (
          <GroupSettingsDialog 
            group={group} 
            members={groupMembers} 
            currentUserRole={currentUserRole} 
            currentUserId={currentUserId}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 pb-8 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 mt-10">No messages yet. Send a message to start the conversation!</div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId
          const isRead = isMine && readReceipts[msg.id] === true
          const isDeleted = !!msg.deleted_at
          const hasMedia = msg.message_media && msg.message_media.length > 0
          const media = hasMedia ? msg.message_media[0] : null

          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} flex-col`}>
              {!isMine && conversationType === 'group' && msg.sender && (
                <div className="text-xs text-slate-500 mb-1 ml-1">{msg.sender.display_name || msg.sender.username}</div>
              )}
              <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-xl px-4 py-2 ${isMine ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`}>
                  {isDeleted ? (
                  <span className="italic opacity-70">Message deleted</span>
                ) : editingMessageId === msg.id ? (
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    <Textarea 
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)}
                      className="text-black dark:text-white"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingMessageId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleEditSubmit(msg.id)}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {media && (
                      <div className="mb-2">
                        <MediaRenderer 
                          mediaType={media.media_type}
                          driveFileId={media.drive_file_id}
                          previewDriveFileId={media.preview_drive_file_id}
                          originalFilename={media.original_filename}
                        />
                      </div>
                    )}
                    {msg.content && <div className="whitespace-pre-wrap break-words">{msg.content}</div>}
                    <div className="flex justify-between items-center mt-1 gap-4 group">
                      <span className="text-[10px] opacity-70 flex items-center gap-1">
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          {msg.edited_at && ' (edited)'}
                        </span>
                        {isMine && conversationType === 'direct' && (
                          <span className="ml-1 inline-flex items-center">
                            {isRead ? (
                              <CheckCheck size={14} className="text-green-700 font-semibold" />
                            ) : isOtherUserOnline ? (
                              <CheckCheck size={14} className="text-slate-300" />
                            ) : (
                              <Check size={14} className="text-slate-300" />
                            )}
                          </span>
                        )}
                      </span>
                        <div className="message-action-menu-container opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-2 relative">
                          <button 
                            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                            aria-label="Message actions"
                            onClick={(e) => {
                              if (activeActionMenu === msg.id) {
                                setActiveActionMenu(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const spaceBelow = window.innerHeight - rect.bottom;
                                // Need enough space for menu (~80px) + composer (~180px)
                                if (spaceBelow < 250) {
                                  setMenuPosition('top');
                                } else {
                                  setMenuPosition('bottom');
                                }
                                setActiveActionMenu(msg.id);
                              }
                            }}
                          >
                            <MoreVertical size={14} />
                          </button>
                          {activeActionMenu === msg.id && (
                            <div className={`absolute right-0 ${menuPosition === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} w-36 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-md shadow-lg flex flex-col z-50 py-1 overflow-hidden`}>
                              {isMine ? (
                                <>
                                  <button 
                                    className="text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-950/50 w-full"
                                    onClick={() => {
                                      setActiveActionMenu(null)
                                      setEditingMessageId(msg.id)
                                      setEditContent(msg.content || '')
                                    }}
                                    aria-label="Edit message"
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    className="text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 w-full"
                                    onClick={() => {
                                      setActiveActionMenu(null)
                                      handleDelete(msg.id)
                                    }}
                                    aria-label="Delete message"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <>
                                  <Link 
                                    href={`/app/profile/${msg.sender?.username || otherProfile?.username}`}
                                    className="text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 w-full block"
                                    onClick={() => setActiveActionMenu(null)}
                                  >
                                    View Profile
                                  </Link>
                                  <button 
                                    className="text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 w-full"
                                    onClick={() => {
                                      setActiveActionMenu(null)
                                      setReportingMessage(msg)
                                    }}
                                    aria-label="Report message"
                                  >
                                    Report Message
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 border-t dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
        {initialIsBlocked ? (
          <div className="flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900 rounded-md border text-slate-500">
            You cannot message this user.
          </div>
        ) : (
          <>
            {selectedFile && (
          <div className="mb-2 p-2 bg-slate-50 dark:bg-slate-900 rounded border flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <span className="text-sm truncate">{selectedFile.name}</span>
              <span className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(1)}MB</span>
            </div>
            {!isSending && (
              <button onClick={() => setSelectedFile(null)} className="text-slate-500 hover:text-red-500">
                <X size={16} />
              </button>
            )}
            {isSending && <span className="text-xs text-blue-500">{uploadProgress}%</span>}
          </div>
        )}
        <div className="flex gap-2 items-start">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*,video/mp4,video/webm"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setSelectedFile(e.target.files[0])
              }
            }}
          />
          <Button 
            variant="ghost" 
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
          >
            <Paperclip size={20} />
          </Button>
          <Textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 resize-none min-h-[120px] h-[120px] p-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button 
            className="h-[44px]"
            disabled={isSending || (!input.trim() && !selectedFile)}
            onClick={handleSend}
          >
            Send
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
    
      {reportingMessage && (
        <MessageReportDialog
          isOpen={!!reportingMessage}
          onOpenChange={(open) => !open && setReportingMessage(null)}
          targetUserId={reportingMessage.sender_id}
          messageId={reportingMessage.id}
          conversationId={conversationId}
        />
      )}
    </>
  )
}
