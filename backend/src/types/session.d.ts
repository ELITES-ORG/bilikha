import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /**
     * Written in place of `userId` when an ID is declined (plan 0053 Step 3.2),
     * so the next request can say why the session ended. `requireAuth` answers
     * it once and destroys the session.
     */
    declineNotice?: { kind: 'retry' | 'final'; reason: string; appealUntil?: string };
  }
}
