'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiUsers, FiMail, FiUser } from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';

export default function SupportCustomers() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/admin/users/`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setUsers(data.results || data || []);
        }
      } catch (e) {
        console.error('Error fetching users:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.email || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mijozlar</h1>
          <p className="text-sm text-[#64748B]">Foydalanuvchilar ro'yxati</p>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-teal-500/10 text-xs text-teal-400 border border-teal-500/20">
          {filteredUsers.length} ta
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ism, email yoki telefon..."
          className="glass-input w-full pl-10"
        />
      </div>

      {/* Users List */}
      {isLoading ? (
        <PageSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u: any, i: number) => (
            <motion.div
              key={u.id || i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass-card p-5 hover:border-teal-500/20 transition-all duration-300"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center">
                  <FiUser className="w-5 h-5 text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.username || u.email}</p>
                  <p className="text-xs text-[#64748B] truncate">{u.email}</p>
                </div>
              </div>
              {u.phone && (
                <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                  <FiMail className="w-3 h-3" />
                  <span>{u.phone}</span>
                </div>
              )}
              <div className="mt-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-teal-500/20 text-teal-400 bg-teal-500/10">
                  {u.role || 'customer'}
                </span>
              </div>
            </motion.div>
          ))}
          {filteredUsers.length === 0 && (
            <div className="col-span-full text-center py-12">
              <FiUsers className="w-12 h-12 mx-auto mb-3 text-[#374151]" />
              <p className="text-[#64748B]">Foydalanuvchilar topilmadi</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
