"use client"

interface YouTubeTutorialProps {
  videoId?: string
  title?: string
  className?: string
}

export function YouTubeTutorial({
  videoId = "q2kOs0NwhPM",
  title = "How to Create a Link in Bio Mobile Website Using Canva",
  className = "",
}: YouTubeTutorialProps) {
  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative w-full h-0 pb-[56.25%]">
        {" "}
        {/* 16:9 aspect ratio */}
        <iframe
          className="absolute top-0 left-0 w-full h-full rounded-lg"
          src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
          title={title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600 mt-1">
          Learn how to create professional link-in-bio websites using Canva with this comprehensive tutorial.
        </p>
      </div>
    </div>
  )
}
