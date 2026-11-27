import { Component, ElementRef, OnInit, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { api, errorMessage } from '../../core/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Shown in the chat but not sent back to the server (greeting, errors). */
  local?: boolean;
  error?: boolean;
}

const STORAGE_KEY = 'mp_chat';
const MAX_CHARS = 1000;
const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    "Hi! I'm the MedPoint assistant. Ask me about our departments, doctors and their timings, consultation fees, booking, payments and refunds, or your medical records.",
  local: true,
};

/**
 * Floating website chatbot (POST /api/chat). Answers from the hospital's live data -
 * with Claude when the server has credentials, otherwise in basic mode.
 */
@Component({
  selector: 'app-chatbot',
  imports: [MatIconModule],
  templateUrl: './chatbot.html',
  styleUrl: './chatbot.scss',
  host: { '(document:keydown.escape)': 'open.set(false)' },
})
export class Chatbot implements OnInit {
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  protected readonly maxChars = MAX_CHARS;
  protected readonly suggestions = [
    'Which departments do you have?',
    'How much is a consultation?',
    'How do I book an appointment?',
    'Will I get a refund if I cancel?',
    'What are your visiting hours?',
  ];

  protected readonly open = signal(false);
  protected readonly messages = signal<ChatMessage[]>([GREETING]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  /** 'ai' when Claude answers, 'basic' for the keyword responder. */
  protected readonly mode = signal<'ai' | 'basic' | null>(null);

  ngOnInit(): void {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) this.messages.set(JSON.parse(saved));
    } catch {
      // Storage unavailable (private mode etc.) - start fresh.
    }
    api
      .get<{ mode: 'ai' | 'basic' }>('/chat/status')
      .then(({ data }) => this.mode.set(data.mode))
      .catch(() => this.mode.set(null));
  }

  protected toggle(): void {
    this.open.update((o) => !o);
    if (this.open()) this.afterUpdate(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter sends; Shift+Enter adds a new line.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected async send(text = this.draft()): Promise<void> {
    const content = text.trim().slice(0, MAX_CHARS);
    if (!content || this.sending()) return;

    this.draft.set('');
    this.push({ role: 'user', content });
    this.sending.set(true);
    try {
      // Only the real conversation goes to the server (not the greeting or error notes).
      const history = this.messages()
        .filter((m) => !m.local)
        .map(({ role, content: c }) => ({ role, content: c }));
      const { data } = await api.post<{ reply: string; mode: 'ai' | 'basic' }>(
        '/chat',
        { messages: history },
        { timeout: 90_000 },
      );
      this.mode.set(data.mode);
      this.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      this.push({ role: 'assistant', content: errorMessage(err), local: true, error: true });
    } finally {
      this.sending.set(false);
      this.afterUpdate(true);
    }
  }

  protected reset(): void {
    this.messages.set([GREETING]);
    this.save();
  }

  /** Suggested questions show until the visitor has asked something. */
  protected showSuggestions(): boolean {
    return !this.messages().some((m) => m.role === 'user');
  }

  private push(message: ChatMessage): void {
    this.messages.update((list) => [...list, message].slice(-40));
    this.save();
    this.afterUpdate(false);
  }

  private save(): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages()));
    } catch {
      // Not critical - the chat just won't survive a reload.
    }
  }

  /** Scrolls to the newest message (and refocuses the input) after the view updates. */
  private afterUpdate(focus: boolean): void {
    setTimeout(() => {
      const el = this.list()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
      if (focus) this.box()?.nativeElement.focus();
    });
  }
}
