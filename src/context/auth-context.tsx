
import { createContext, useContext, useEffect, useState } from "react";
import { User, UserRole } from "@/types";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Session, AuthError } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, adminCode?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Admin code for local admin registration
const ADMIN_CODE = "79041167197200060295";

// Helper function to clean up auth state
const cleanupAuthState = () => {
  // Remove standard auth tokens
  localStorage.removeItem('supabase.auth.token');
  // Remove all Supabase auth keys from localStorage
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      localStorage.removeItem(key);
    }
  });
  // Remove from sessionStorage if in use
  Object.keys(sessionStorage || {}).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      sessionStorage.removeItem(key);
    }
  });
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  console.log("Current auth state:", { user, sessionExists: !!session });

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      try {
        // Set up auth state listener FIRST
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, currentSession) => {
            console.log("Auth state change:", event, currentSession?.user?.id);
            setSession(currentSession);
            if (currentSession?.user) {
              // Get user profile data
              setTimeout(async () => {
                try {
                  const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', currentSession.user.id)
                    .single();
                    
                  if (profileData) {
                    const userData = {
                      id: currentSession.user.id,
                      name: currentSession.user.user_metadata?.name || 
                            profileData.name ||
                            currentSession.user.email?.split('@')[0] || 
                            'User',
                      email: currentSession.user.email || '',
                      role: profileData.role as UserRole,
                      createdAt: profileData.created_at || currentSession.user.created_at,
                    };
                    console.log("Setting user data:", userData);
                    setUser(userData);
                  } else {
                    console.error("No profile data found for user:", currentSession.user.id);
                  }
                } catch (error) {
                  console.error("Error fetching user profile:", error);
                }
              }, 0);
            } else {
              setUser(null);
            }
          }
        );

        // THEN check for existing session
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        
        if (data.session?.user) {
          console.log("Found existing session for user:", data.session.user.id);
          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.session.user.id)
              .single();
              
            if (profileData) {
              const userData = {
                id: data.session.user.id,
                name: data.session.user.user_metadata?.name || 
                      profileData.name ||
                      data.session.user.email?.split('@')[0] || 
                      'User',
                email: data.session.user.email || '',
                role: profileData.role as UserRole,
                createdAt: profileData.created_at || data.session.user.created_at,
              };
              console.log("Setting initial user data:", userData);
              setUser(userData);
            } else {
              console.warn("No profile found for user, trying to create one:", data.session.user.id);
              
              // Create profile if it doesn't exist
              const { error: insertError } = await supabase
                .from('profiles')
                .insert([{ 
                  id: data.session.user.id,
                  role: 'user'
                }]);
                
              if (insertError) {
                console.error("Error creating profile:", insertError);
              } else {
                const userData = {
                  id: data.session.user.id,
                  name: data.session.user.user_metadata?.name || 
                        data.session.user.email?.split('@')[0] || 
                        'User',
                  email: data.session.user.email || '',
                  role: 'user' as UserRole,
                  createdAt: data.session.user.created_at,
                };
                console.log("Created profile and setting user data:", userData);
                setUser(userData);
              }
            }
          } catch (error) {
            console.error("Error fetching initial user profile:", error);
          }
        }

        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      // Clean up existing auth state
      cleanupAuthState();
      
      // Try global sign out first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      toast.success(`Welcome back!`);
      return;
    } catch (error) {
      const authError = error as AuthError;
      console.error("Login error:", authError);
      
      if (authError.message.includes('Email not confirmed')) {
        toast.error("Please check your email and confirm your account");
      } else {
        toast.error(authError.message || "Failed to log in");
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string, adminCode?: string) => {
    setLoading(true);
    try {
      // Clean up existing auth state
      cleanupAuthState();
      
      // Try global sign out first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
      }
      
      let role: UserRole = 'user';
      
      // Check admin code if provided
      if (adminCode) {
        if (adminCode === ADMIN_CODE) {
          role = 'admin';
        } else {
          toast.error("Invalid admin code");
          setLoading(false);
          return;
        }
      }
      
      // Register with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            role,
          },
        },
      });

      if (error) throw error;
      
      if (data.user) {
        // Create profile for the user
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{
            id: data.user.id,
            role,
            name
          }]);
          
        if (profileError) {
          console.error("Error creating profile:", profileError);
          toast.error("Account created but profile setup failed");
        }
        
        toast.success(`Registration successful! ${data.session ? '' : 'Please check your email to confirm your account.'}`);
      }
    } catch (error) {
      const authError = error as AuthError;
      console.error("Registration error:", authError);
      toast.error(authError.message || "Failed to register");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      // Clean up existing auth state
      cleanupAuthState();
      
      // Try global sign out first
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Continue even if this fails
      }
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      
      // Auth flow will redirect user, so no need for additional logic here
    } catch (error) {
      const authError = error as AuthError;
      console.error("Google login error:", authError);
      toast.error(authError.message || "Failed to log in with Google");
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      
      // Clean up auth state
      cleanupAuthState();
      
      // Sign out from Supabase
      await supabase.auth.signOut({ scope: 'global' });
      
      setUser(null);
      setSession(null);
      
      toast.info("Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to log out");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
