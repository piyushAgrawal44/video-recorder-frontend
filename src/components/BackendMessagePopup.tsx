import { useEffect, useState } from "react";

type MessagePopupProps = {
  message: string;
  type?: "info" | "success" | "error";
  duration?: number; // milliseconds
};

const typeStyles = {
  info: "bg-blue-100 text-blue-800 border-blue-300",
  success: "bg-green-100 text-green-800 border-green-300",
  error: "bg-red-100 text-red-800 border-red-300",
};

const BackendMessagePopup = ({ message, type = "info", duration = 5000 }: MessagePopupProps) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div className={`fixed top-4 right-4 max-w-xs w-full z-50 shadow-lg border-l-4 px-4 py-3 rounded ${typeStyles[type]}`}>
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={() => setVisible(false)}
          className="ml-4 text-lg font-bold text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default BackendMessagePopup;
