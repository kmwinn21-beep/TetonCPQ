import { TetonMark } from '@/components/AppShell';

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-teton-almost-white">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 text-teton-ink">
          <TetonMark className="w-7 h-7" />
          <span className="text-lg font-semibold">Teton Proposal Generator</span>
        </div>
        <div className="card">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-teton-ui-gray mt-1">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
