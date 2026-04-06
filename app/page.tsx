'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import Logo from '@/app/components/Logo';
import CampaignCard from './components/CampaignCard';
import type { CampaignStatus } from './types';

export interface Campaign {
  id: string;
  name?: string;
  status: CampaignStatus;
  subject: string;
  scheduledAt: string | null;
  sendNow: boolean;
  recipientCount: number;
  sent: number;
  failed: number;
  createdAt: string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        toast.success('Campaign deleted');
      } else {
        toast.error('Failed to delete campaign');
      }
    } catch {
      toast.error('Network error. Please try again.');
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/campaigns')
        .then((res) => res.json())
        .then((data) => {
          setCampaigns(Array.isArray(data) ? data : []);
          setIsLoading(false);
        })
        .catch(() => {
          setCampaigns([]);
          setIsLoading(false);
        });
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-cp-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cp-border border-t-white animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-cp-black flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-cp-dark border border-cp-border rounded-xl p-8 flex flex-col items-center text-center">
          <div className="mb-8">
            <Logo size={48} />
          </div>
          <h1 className="text-2xl font-heading text-white mb-2">Welcome to CampaignPilot</h1>
          <p className="text-cp-grey mb-8">Sign in to manage your email campaigns</p>
          <button
            onClick={() => signIn('google')}
            className="w-full bg-white text-black hover:bg-cp-light transition-colors font-medium rounded-lg px-4 py-3 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cp-black text-white">
      <header className="sticky top-0 z-50 bg-cp-black/80 backdrop-blur-md border-b border-cp-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo showText size={28} />
          </Link>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{session?.user?.name}</p>
                <p className="text-xs text-cp-grey">{session?.user?.email}</p>
              </div>
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt="Avatar"
                  width={36}
                  height={36}
                  className="rounded-full border border-cp-border"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-cp-charcoal border border-cp-border flex items-center justify-center text-cp-grey">
                  {session?.user?.name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            <button
              onClick={() => signOut()}
              className="text-sm text-cp-grey hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <h1 className="text-3xl font-heading text-white">Your Campaigns</h1>
          <Link
            href="/campaign/new"
            className="inline-flex items-center justify-center gap-2 bg-white text-black px-5 py-2.5 rounded-lg font-medium hover:bg-cp-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Campaign
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-cp-charcoal border border-cp-border rounded-xl h-[200px] animate-pulse" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="w-full border-2 border-dashed border-cp-border rounded-xl p-12 flex flex-col items-center justify-center text-center bg-cp-dark/50">
            <div className="text-cp-muted mb-4">
              <Logo size={64} />
            </div>
            <h3 className="text-xl font-heading text-white mb-2">No campaigns yet</h3>
            <p className="text-cp-grey max-w-sm mb-6">
              Create your first email campaign to start reaching your audience.
            </p>
            <Link
              href="/campaign/new"
              className="bg-cp-charcoal text-cp-light hover:text-white border border-cp-border hover:border-cp-muted px-4 py-2 rounded-lg transition-colors font-medium"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
