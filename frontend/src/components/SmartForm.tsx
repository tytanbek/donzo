'use client';

import React from 'react';

interface ServiceField {
  id: number;
  field_name: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  validation_regex: string;
  options?: string[];
}

interface SmartFormProps {
  fields: ServiceField[];
  values: Record<string, string>;
  errors: Record<string, string>;
  onChange: (fieldName: string, value: string) => void;
  // Maydon nomlari ro'yxati — ko'rsatilmaydi, lekin qiymati values'da saqlanadi
  // (masalan telegram-premium username avtomatik to'ldirilganda).
  hiddenFields?: string[];
  // Maydon nomlari ro'yxati — faqat o'qish rejimida (o'chirib bo'lmaydi),
  // qiymat avtomatik kelganligini ko'rsatish uchun.
  readOnlyFields?: string[];
}

export default function SmartForm({ fields, values, errors, onChange, hiddenFields = [], readOnlyFields = [] }: SmartFormProps) {
  if (!fields || fields.length === 0) {
    return (
      <div className="text-center py-8 text-[#64748B]">
        <p className="text-sm">Bu xizmat uchun forma maydonlari mavjud emas</p>
      </div>
    );
  }

  const visibleFields = fields
    .filter((f) => !hiddenFields.includes(f.field_name))
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  if (visibleFields.length === 0) {
    return (
      <div className="text-center py-4 text-[#64748B] text-sm">
        <p>✓ Ma'lumotlaringiz avtomatik to'ldirildi — to'lovga o'ting</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleFields.map((field) => {
        const readOnly = readOnlyFields.includes(field.field_name);
        return (
          <div key={field.field_name}>
            <label className="block text-sm font-medium text-[#94A3B8] mb-2">
              {field.field_label}
              {field.is_required && <span className="text-red-400 ml-1">*</span>}
            </label>
            {field.field_type === 'select' ? (
              <select
                value={values[field.field_name] || ''}
                onChange={(e) => onChange(field.field_name, e.target.value)}
                disabled={readOnly}
                className={`glass-input ${errors[field.field_name] ? 'error' : ''} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <option value="">Tanlang...</option>
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.field_type === 'number' ? 'number' : 'text'}
                placeholder={field.field_label}
                value={values[field.field_name] || ''}
                onChange={(e) => onChange(field.field_name, e.target.value)}
                readOnly={readOnly}
                className={`glass-input ${errors[field.field_name] ? 'error' : ''} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
              />
            )}
            {readOnly && (
              <p className="text-[10px] text-[#2DD4BF] mt-1">✓ Avtomatik to'ldirildi</p>
            )}
            {errors[field.field_name] && (
              <p className="text-xs text-red-400 mt-1">{errors[field.field_name]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
