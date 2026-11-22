import { useSyncExternalStore } from 'react'
import english from '../electron/locales/en.json'

export type Language = 'ru' | 'en'
export type LanguageMode = Language | 'system'
const messages: Record<string, string> = english
let language: Language = window.kadr?.initialLanguage === 'en' ? 'en' : 'ru'
const subscribers = new Set<() => void>()

export const getLanguage = () => language
document.documentElement.lang = language

function subscribe(listener: () => void) {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage)
}

export function setLanguage(next: Language) {
  if (language === next) return
  language = next
  document.documentElement.lang = language
  subscribers.forEach(listener => listener())
}

export function t(message: string, ...values: unknown[]) {
  const template = language === 'en' && Object.hasOwn(messages, message) ? messages[message] : message
  return template.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)]) : match)
}

export function genreLabel(genre: string) {
  const label = t(genre.toLowerCase())
  return label.slice(0, 1).toLocaleUpperCase(language) + label.slice(1)
}
