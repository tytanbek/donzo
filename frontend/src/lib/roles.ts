// Umumiy rol label/color map'lari — admin panel bo'ylab bir joydan ishlatiladi.
export const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  senior_operator: 'Senior Operator',
  operator: 'Operator',
  support: 'Support',
  customer: 'Mijoz',
  guest: 'Mehmon',
};

export const roleColors: Record<string, string> = {
  super_admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  admin: 'bg-[#00F5FF]/20 text-[#00F5FF] border-[#00F5FF]/30',
  senior_operator: 'bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/30',
  operator: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  support: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  customer: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  guest: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};
