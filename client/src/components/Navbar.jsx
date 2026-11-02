// Fixed top navigation bar: NDMA logo, the portal title, and the G-20 badge.
// Mirrors the old portal navbar.
export default function Navbar() {
  return (
    <nav className="navbar">
      <img className="logo" id="nav-ham" src="/ndma_logo.png" alt="NDMA" />
      <a className="navbar-brand" id="nav-title" href="#">Global Seismic &amp; Tsunami Watch</a>
      <a className="navbar-brand" id="G-12" href="#">G-20</a>
    </nav>
  );
}
