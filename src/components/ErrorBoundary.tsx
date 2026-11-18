import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Empêche un plan/arbre inattendu de laisser un écran blanc dans l'hôte Power Apps. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console in development only
    if (import.meta.env.DEV) {
      console.error('Organigramme — erreur de rendu:', error, info.componentStack);
    }
  }

  private reset = () => {
    this.setState({ error: null });
    window.scrollTo(0, 0);
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Une erreur est survenue</h1>
        <p className="max-w-md text-sm text-slate-500">
          L’affichage a rencontré un problème. Vous pouvez réessayer ; si l’erreur persiste,
          rechargez la page et réimportez le fichier.
        </p>
        <pre className="max-w-md overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-rose-700">
          {error.message}
        </pre>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm transition hover:bg-slate-100"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
