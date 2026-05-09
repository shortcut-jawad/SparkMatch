// utils.js: shared pure utility functions used across auth and app modules

export function initials(name) {
  return name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
}

export function setLoading(btnId, loading, text) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.innerHTML = loading ? '<div class="spinner"></div>' : text;
}

export function previewPic(input, thumbId) {
  const thumb = document.getElementById(thumbId);
  if (input.files?.[0]) {
    const reader = new FileReader();
    reader.onload = e => { thumb.src = e.target.result; thumb.style.display = 'block'; };
    reader.readAsDataURL(input.files[0]);
  }
}

// Compress image to max 400px, JPEG 0.75 quality; resolves with a Blob or null
export function compressPic(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 400;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(resolve, 'image/jpeg', 0.75);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Expose previewPic globally for inline onchange attributes in HTML
window.previewPic = previewPic;
