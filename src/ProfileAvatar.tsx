import monogram from './assets/nova-mark.png'
import type { LocalProfile } from './types'

export function ProfileAvatar({ profile }: { profile: LocalProfile }) {
  return <span className={`profile-avatar ${profile.avatar ? 'has-photo' : 'default-avatar'}`} aria-hidden="true"><img className={profile.avatar ? undefined : 'nova-mark'} src={profile.avatar || monogram} alt="" /></span>
}
