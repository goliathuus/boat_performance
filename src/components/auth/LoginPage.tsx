import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

// SVG Components
function CompassIcon() {
  return (
    <svg
      className="w-24 h-24 text-white/80 animate-float"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="50" cy="50" r="3" fill="currentColor" />
      <line x1="50" y1="5" x2="50" y2="20" stroke="currentColor" strokeWidth="2" />
      <line x1="50" y1="80" x2="50" y2="95" stroke="currentColor" strokeWidth="2" />
      <line x1="5" y1="50" x2="20" y2="50" stroke="currentColor" strokeWidth="2" />
      <line x1="80" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="2" />
      <text x="50" y="35" textAnchor="middle" fontSize="12" fill="currentColor" fontWeight="bold">N</text>
      <path
        d="M 50 20 L 45 35 L 50 30 L 55 35 Z"
        fill="currentColor"
        className="animate-pulse"
      />
    </svg>
  );
}

function SailboatIcon() {
  return (
    <svg
      className="w-32 h-32 text-white/70 animate-float"
      style={{ animationDelay: '1s' }}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hull */}
      <path
        d="M 30 150 Q 100 140 170 150 L 170 180 L 30 180 Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Mast */}
      <line x1="100" y1="150" x2="100" y2="50" stroke="currentColor" strokeWidth="3" />
      {/* Sail */}
      <path
        d="M 100 50 L 100 150 L 160 120 Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Wind lines */}
      <path
        d="M 20 80 Q 40 75 60 80"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.6"
        className="animate-pulse"
      />
      <path
        d="M 20 100 Q 40 95 60 100"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        opacity="0.6"
        style={{ animationDelay: '0.5s' }}
        className="animate-pulse"
      />
    </svg>
  );
}

function AnimatedMetric({ label, value, unit, color = 'text-blue-300' }: { label: string; value: number; unit: string; color?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    const stepDuration = duration / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(increment * step, value);
      setDisplayValue(current);
      if (step >= steps) {
        clearInterval(timer);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${color} mb-1`}>
        {displayValue.toFixed(1)}
        <span className="text-lg ml-1">{unit}</span>
      </div>
      <div className="text-sm text-white/70 uppercase tracking-wider">{label}</div>
    </div>
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

  if (checkingSession) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700">
        <div className="text-lg text-white">Checking session...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col md:flex-row overflow-hidden relative">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800 animate-gradient" style={{ backgroundSize: '200% 200%' }} />
      
      {/* Waves */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden">
        <div className="wave" />
        <div className="wave" />
        <div className="wave" />
      </div>

      {/* Left Section - Visuals (Desktop only) */}
      <div className="hidden md:flex flex-1 flex-col items-center justify-center p-12 relative z-10">
        <div className="max-w-lg w-full space-y-8">
          {/* Hero Content */}
          <div className="text-center space-y-4 animate-slideInRight">
            <h1 className="text-5xl font-bold text-white mb-2">
              Boat Tracker
            </h1>
            <p className="text-xl text-white/90">
              Analysez vos performances, optimisez votre navigation
            </p>
          </div>

          {/* Icons */}
          <div className="flex items-center justify-center gap-12 mt-12">
            <CompassIcon />
            <SailboatIcon />
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-3 gap-6 mt-16">
            <AnimatedMetric label="Vitesse" value={12.5} unit="kn" color="text-green-300" />
            <AnimatedMetric label="Distance" value={45.2} unit="nm" color="text-blue-300" />
            <AnimatedMetric label="Temps" value={3.8} unit="h" color="text-cyan-300" />
          </div>
        </div>
      </div>

      {/* Mobile Hero (only on mobile) */}
      <div className="md:hidden flex flex-col items-center justify-center pt-12 pb-6 relative z-10">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Boat Tracker
        </h1>
        <p className="text-lg text-white/90 text-center px-4">
          Analysez vos performances, optimisez votre navigation
        </p>
      </div>

      {/* Right Section - Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-md animate-slideInRight">
          {/* Glassmorphism Card */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl p-6 md:p-10">
            <div className="text-center mb-6 md:mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {isSignUp ? 'Créer un compte' : 'Connexion'}
              </h2>
              <p className="text-white/80 text-sm">
                {isSignUp ? 'Rejoignez la communauté' : 'Accédez à vos données'}
              </p>
            </div>
            
            {error && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 text-red-100 rounded-lg text-sm backdrop-blur-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 text-green-100 rounded-lg text-sm backdrop-blur-sm">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white/90 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent backdrop-blur-sm transition-all"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-2">
                  Mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent backdrop-blur-sm transition-all"
                  placeholder="••••••••"
                />
              </div>

              {isSignUp && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/90 mb-2">
                    Confirmer le mot de passe
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent backdrop-blur-sm transition-all"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-white text-blue-600 hover:bg-white/90 font-semibold py-3 text-lg transition-all shadow-lg"
                disabled={loading}
              >
                {loading 
                  ? (isSignUp ? 'Création du compte...' : 'Connexion...') 
                  : (isSignUp ? 'S\'inscrire' : 'Se connecter')
                }
              </Button>
            </form>

            <div className="mt-6 text-center">
              {isSignUp ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setSuccessMessage(null);
                    setEmail('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  className="text-sm text-white/80 hover:text-white underline transition-colors"
                >
                  Déjà un compte ? Se connecter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-sm text-white/80 hover:text-white underline transition-colors"
                >
                  Pas encore de compte ? S'inscrire
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
