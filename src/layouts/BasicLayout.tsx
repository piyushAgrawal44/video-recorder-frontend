import { useState, useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  FiHome, 
  FiVideo, 
  FiMenu, 
  FiUser
} from 'react-icons/fi';

interface BasicLayoutProps {
  children: ReactNode;
}

function BasicLayout({ children }: BasicLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  
  // Navigation links with React Icons
  const navLinks = [
    { name: 'Dashboard', path: '/', icon: <FiHome size={20} /> },
    { name: 'Recordings', path: '/recordings', icon: <FiVideo size={20} /> },
  ];

  // Handle scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Toggle sidebar for mobile view
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 transition-opacity lg:hidden" 
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-indigo-700 transition duration-300 ease-in-out transform lg:translate-x-0 lg:relative lg:flex-shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-16 bg-indigo-800">
          <span className="text-white font-bold text-xl">Video Recorder</span>
        </div>
        
        {/* Navigation */}
        <nav className="mt-8 px-3 space-y-1">
          {navLinks.map((item) => {
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`${
                  isActive
                    ? 'bg-indigo-800 text-white'
                    : 'text-indigo-100 hover:bg-indigo-600'
                } group flex items-center px-4 py-3 text-base font-medium rounded-md transition duration-150 ease-in-out`}
              >
                <span className={`${isActive ? 'text-white' : 'text-indigo-300'} mr-4`}>
                  {item.icon}
                </span>
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        {/* User info */}
        <div className="absolute bottom-0 w-full">
          <div className="flex items-center px-4 py-4 bg-indigo-800">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center">
                <FiUser className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-3">
              <div className="text-base font-medium text-white">User Name</div>
              <div className="text-sm font-medium text-indigo-200">user@example.com</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top navbar */}
        <div className={`sticky top-0 z-10 ${scrolled ? 'bg-white shadow' : 'bg-transparent'} transition-all duration-200`}>
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <button
              onClick={toggleSidebar}
              className="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              aria-controls="mobile-menu"
              aria-expanded="false"
            >
              <span className="sr-only">Open sidebar</span>
              <FiMenu className="h-6 w-6" />
            </button>
            
            {/* Page title - visible on larger screens */}
            <h1 className="hidden md:block text-xl font-semibold text-gray-800">
              {navLinks.find(link => link.path === location.pathname)?.name || 'Dashboard'}
            </h1>
            
            {/* Spacer for mobile */}
            <div className="md:hidden"></div>
            
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-auto">
          <div className="py-6">
            <div className="px-4 sm:px-6 lg:px-8">
              {/* Mobile-only page title */}
              <h1 className="md:hidden text-xl font-semibold text-gray-800 mb-4">
                {navLinks.find(link => link.path === location.pathname)?.name || 'Dashboard'}
              </h1>
              
              {/* Page content */}
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                {children}
              </div>
            </div>
          </div>
        </main>
        
        {/* Footer */}
        <footer className="bg-white border-t border-gray-200">
          <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Video Recording App. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default BasicLayout;