import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from './theme-toggle';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { t } = useTranslation('common');
  return (
    <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'var(--background)' }}>
      <div className="flex h-16 items-center gap-2 sm:gap-4 px-4 sm:px-6 md:pl-6">
        <div className="flex-1 min-w-0 md:ml-0 ml-12">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block w-32 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t('actions.search')}
              className="pl-8 w-full"
            />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
