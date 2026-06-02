export type WorkspaceContext = {
  id: string;
  slug: string;
  name: string;
};

export type UserContext = {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  isSuper: boolean;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      workspace?: WorkspaceContext;
      user?: UserContext;
    }
  }
}
