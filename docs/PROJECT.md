# PROJECT.md

## 1. Product definition

Campus Messenger is an unofficial, student-built communication platform for a small college community.

It is not affiliated with, endorsed by, or operated by the college.

The application should feel lightweight and familiar: Discord-like in layout, but much simpler.

## 2. Primary user journey

1. Student opens the website.
2. Student signs up using email/password or Google.
3. Student completes a simple profile.
4. Student chooses a unique username.
5. Student lands on the Messages screen.
6. Student searches for another user by username or opens a group.
7. Student sends messages and optionally attaches an image, GIF, or video.
8. Student receives messages in real time.

## 3. V1 feature set

### Authentication

- Email/password signup and login.
- Google OAuth.
- Logout.
- Password reset for email accounts.
- Persistent authenticated session.

### Profiles

- Display name.
- Unique username.
- Avatar.
- Course.
- Semester.
- Batch.
- Bio.
- Account creation date internally.

### Search

- Search users by exact/partial username.
- Search groups.
- Search messages only if practical after core chat is stable.
- Username is the canonical identity users can share with others.

### Direct messages

- One-to-one conversations.
- Text messages.
- Replies.
- Reactions.
- Images/GIFs/videos.
- Edit/delete own messages.
- Read state.

### Groups

- Public groups.
- Private groups.
- Invite-only groups.
- Group name, description, icon.
- Owner, moderator, member roles only.
- Join/leave group.
- Add/remove members according to role.

### Notifications

- New direct message.
- New group message when relevant.
- Mention.
- Group invitation.
- Reaction.

### Moderation

- Report message.
- Block user.
- Delete message as moderator/admin.
- Remove member.
- Ban/suspend user.
- Basic admin dashboard.

## 4. V1 non-goals

Do not implement these unless explicitly approved later:

- Voice calls.
- Video calls.
- Complex Discord-like server hierarchies.
- Multiple channel types.
- Advanced permissions matrix.
- AI assistant.
- Recommendation algorithms.
- Native mobile applications.
- Microservices.
- Dedicated message queue.
- Dedicated search cluster.
- Video transcoding.

## 5. Expected usage

Initial expected usage is about 100 users/day, with a small college community.

Design for correctness and clean architecture first. Do not optimize prematurely for massive scale.
