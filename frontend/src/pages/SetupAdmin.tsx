import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth-store';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

export function SetupAdmin() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { config, user, setupAdmin } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const canSetup = config?.admin.bootstrap_required && user?.username === 'admin-token';

  if (!canSetup) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await setupAdmin(username, password);
      await useAuthStore.getState().initialize();
      navigate('/', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="fixed right-3 top-3"><LanguageSwitcher /></div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
          <CardTitle className="text-2xl">{t('setup.title')}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">{t('setup.details')}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><label htmlFor="setup-username" className="text-sm font-medium">{t('setup.username')}</label><Input id="setup-username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required disabled={isLoading} autoComplete="username" /></div>
            <div className="space-y-2"><label htmlFor="setup-password" className="text-sm font-medium">{t('setup.password')}</label><Input id="setup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required disabled={isLoading} autoComplete="new-password" /></div>
            <div className="space-y-2"><label htmlFor="setup-confirmation" className="text-sm font-medium">{t('setup.confirmPassword')}</label><Input id="setup-confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required disabled={isLoading} autoComplete="new-password" /></div>
            <Button type="submit" className="w-full" disabled={isLoading || username.length < 3 || password.length < 12 || password !== confirmation}>{isLoading ? t('setup.submitting') : t('setup.submit')}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
