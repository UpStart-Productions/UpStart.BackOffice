export type UserContext = {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role: 'ADMIN' | 'MEMBER';
  isSuper: boolean;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: UserContext;
    }
  }
}
