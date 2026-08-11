'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FiSearch } from 'react-icons/fi';
import { serviceAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await serviceAPI.list({ search: query });
        setResults(res.data.results || res.data);
        setIsOpen(true);
      } catch (e) { toast.error('Qidiruv vaqtida xatolik yuz berdi'); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative w-full max-w-2xl mx-auto" ref={ref}>
      <div className="relative">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
        <input
          type="text"
          placeholder="Qidirish... (Mobile Legends, PUBG, Telegram Premium...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          className="glass-input pl-12 pr-4 py-4 text-base"
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full glass-card p-2 animate-fade-in z-50">
          {results.map((service: any) => (
            <Link
              key={service.id}
              href={`/services/${service.slug}`}
              onClick={() => { setIsOpen(false); setQuery(''); }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center font-bold text-[#00F5FF] text-sm">
                {service.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{service.name}</div>
                <div className="text-xs text-[#64748B]">{service.category_name}</div>
              </div>
              <div className="text-xs text-[#00F5FF]">
                {service.packages?.length || 0} paket
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
