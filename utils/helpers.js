function publicUser(u) {
  return { id: u._id, username: u.username, displayName: u.displayName, bio: u.bio, picture: u.picture, city: u.city || '' };
}

module.exports = {
  publicUser,
};
