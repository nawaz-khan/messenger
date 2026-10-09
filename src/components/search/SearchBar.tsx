'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  
  const router = useRouter()
  const supabase = createClient()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const search = async () => {
      const trimmed = query.trim().toLowerCase().replace(/^@/, '')
      if (!trimmed) {
        setResults([])
        return
      }

      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, course, semester')
        .ilike('username_normalized', `${trimmed}%`)
        .limit(10)

      if (!error && data) {
        setResults(data)
      }
      setLoading(false)
    }

    const timer = setTimeout(() => {
      search()
    }, 250)

    return () => clearTimeout(timer)
  }, [query, supabase])

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setShowDropdown(true)
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search users by username..."
        className="w-full px-4 py-2 border rounded-full text-sm dark:bg-slate-900 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {showDropdown && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-lg shadow-lg overflow-hidden z-50 max-h-96 overflow-y-auto">
          {loading && (
            <div className="p-4 text-sm text-slate-500 text-center">Searching...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-4 text-sm text-slate-500 text-center">No users found.</div>
          )}
          {!loading && results.length > 0 && (
            <ul className="divide-y dark:divide-slate-800">
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 flex flex-col items-start"
                    onClick={() => {
                      setShowDropdown(false)
                      router.push(`/app/profile/${user.username}`)
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
                        {user.avatar_url && (
                          <Image src={user.avatar_url} alt={user.display_name} fill className="object-cover" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {user.display_name}
                        </div>
                        <div className="text-xs text-slate-500">@{user.username}</div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
