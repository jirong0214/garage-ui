export interface AuthConfig {
  admin: {
    enabled: boolean;
    bootstrap_required?: boolean;
  };
  oidc: {
    enabled: boolean;
    provider?: string;
  };
  token: {
    enabled: boolean;
  };
}

export interface AuthUser {
  username: string;
  email?: string;
  name?: string;
  auth_method?: 'admin' | 'token' | 'bootstrap-token' | 'oidc';
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
