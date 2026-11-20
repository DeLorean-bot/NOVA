import { Bell, Clock3, Film, Info, Palette, Play, RotateCw, Settings, ShieldCheck, Tv, User, Volume2, X } from './icons'
import type { MenuIconName } from './types'
const icons={Bell,Clock3,Film,Info,Palette,Play,RotateCw,Settings,ShieldCheck,Tv,User,Volume2,X}
export function MenuIcon({name,size=18}:{name:MenuIconName;size?:number}) { const Icon=icons[name];return <Icon size={size}/> }
