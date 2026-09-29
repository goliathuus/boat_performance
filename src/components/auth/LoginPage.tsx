import { useState, useEffect, FormEvent, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { StravaSubmitCallout } from '@/components/StravaSubmitCallout';
import { WindBackdrop } from '@/components/ui/WindBackdrop';
import { BrandWordmark, Credits } from '@/components/ui/brand';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const FEATURES: Array<{ icon: ReactNode; title: string; text: string }> = [
  {
    icon: (
      <path d="M4 17c3-6 6-8 9-6s5 1 7-3M4 17h.01M20 8h.01" />
    ),
    title: 'Replay de toute la flotte',
    text: 'Traces GPS interpolées, lecture fluide jusqu’à ×500.',
  },
  {
    icon: (
      <>
        <path d="M3 8h11a3 3 0 1 0-3-3" />
        <path d="M3 12h16a3 3 0 1 1-3 3" />
        <path d="M3 16h7" />
      </>
    ),
    title: 'Le vent du jour',
    text: 'AROME 1,3 km au quart d’heure ou ECMWF, consultable point par point.',
  },
  {
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 3 3 6-6" />
      </>
    ),
    title: 'Classements',
    text: 'Au temps ou entre deux portes que vous tracez sur la carte.',
  },
];

function FeatureIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/25">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          onLoginSuccess();
        }
      } catch (err) {
        console.error('Error checking session:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        onLoginSuccess();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onLoginSuccess]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (isSignUp) {
      // Validation pour l'inscription
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas');
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
        setLoading(false);
        return;
      }

      try {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccessMessage(
            'Inscription réussie ! Vérifiez votre email pour confirmer votre compte. Vous pouvez ensuite vous connecter.'
          );
          // Réinitialiser les champs
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          // Revenir au mode login après 3 secondes
          setTimeout(() => {
            setIsSignUp(false);
            setSuccessMessage(null);
          }, 3000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'inscription');
      } finally {
        setLoading(false);
      }
    } else {
      // Login existant
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
        } else {
          onLoginSuccess();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred during login');
      } finally {
        setLoading(false);
      }
    }
  };


  const switchMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError(null);
    setSuccessMessage(null);
    if (!signUp) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  };

  if (checkingSession) {
    return (
      <div className="relative w-screen app-shell flex items-center justify-center">
        <WindBackdrop />
        <LoadingSpinner size="lg" text="Vérification de la session…" className="relative" />
      </div>
    );
  }

  return (
    <div className="relative w-screen app-shell flex flex-col overflow-y-auto overflow-x-hidden">
      <WindBackdrop intensity={1.2} className="fixed" />

      <div className="relative mx-auto grid w-full flex-1 max-w-6xl grid-cols-1 items-center gap-10 px-5 py-10 md:grid-cols-[1.1fr_1fr] md:gap-16 md:px-10">
        {/* Accroche */}
        <section className="space-y-8">
          <BrandWordmark />
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
              Rejouez vos courses.
              <br />
              <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-emerald-200 bg-clip-text text-transparent">
                Lisez le vent.
              </span>
            </h1>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              Traces, vitesses et vent modélisé réunis sur une même carte, pour comprendre chaque bord.
            </p>
          </div>
          <ul className="hidden space-y-4 md:block">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <FeatureIcon>{f.icon}</FeatureIcon>
                <div>
                  <div className="text-sm font-medium text-foreground">{f.title}</div>
                  <div className="text-sm text-muted-foreground">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Formulaire */}
        <section className="w-full md:justify-self-end md:max-w-md">
          <div className="glass rounded-2xl border p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {isSignUp ? 'Créer un compte' : 'Connexion'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSignUp ? 'Rejoignez la communauté.' : 'Accédez à vos sessions et replays.'}
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            {successMessage && (
              <div role="status" className="mb-4 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-2.5 text-sm text-emerald-200">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="field"
                  placeholder="vous@exemple.fr"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="field"
                  placeholder="••••••••"
                />
              </div>

              {isSignUp && (
                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">
                    Confirmer le mot de passe
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="field"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <Button type="submit" className="h-11 w-full rounded-lg text-[15px] font-semibold shadow-lg shadow-primary/20" disabled={loading}>
                {loading
                  ? (isSignUp ? 'Création du compte…' : 'Connexion…')
                  : (isSignUp ? 'S’inscrire' : 'Se connecter')}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(!isSignUp)}
                className="font-medium text-primary transition-colors hover:text-primary/80"
              >
                {isSignUp ? 'Se connecter' : 'S’inscrire'}
              </button>
            </p>

            <div className="mt-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground/70">
              <span className="h-px flex-1 bg-foreground/10" />
              ou
              <span className="h-px flex-1 bg-foreground/10" />
            </div>
            <div className="mt-4">
              <StravaSubmitCallout variant="login" />
            </div>
          </div>
        </section>
      </div>

      <Credits className="relative pb-6 safe-bottom" />
    </div>
  );
}
