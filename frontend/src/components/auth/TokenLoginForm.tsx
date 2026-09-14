import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

export function TokenLoginForm({ bootstrap = false }: { bootstrap?: boolean }) {
  const { t } = useTranslation('auth');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginToken } = useAuthStore();

  const returnUrl = searchParams.get('returnUrl') || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await loginToken(token);
      navigate(bootstrap ? '/setup' : decodeURIComponent(returnUrl));
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-center mb-4">
          <img
            src="/garage.png"
            alt={t('login.logoAlt')}
            className="h-16 w-16 object-contain"
          />
        </div>
        <CardTitle className="text-2xl text-center">
          {bootstrap ? t('setup.tokenTitle') : t('login.welcome')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="admin-token" className="text-sm font-medium">{t('login.token')}</label>
            <Input
              id="admin-token"
              type="password"
              placeholder={t('login.tokenPlaceholder')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="off"
            />
          </div>
          {bootstrap && (
            <p className="text-sm leading-6 text-muted-foreground">
              {t('setup.tokenHelp')}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !token}
          >
            {isLoading ? t('login.signingIn') : t('login.signIn')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
