import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';

interface SelectedClip {
    id: string;
    clipId?: string;
    videoId: string;
    startTime: number;
    endTime: number;
    transcript?: string;
    videoName?: string;
    thumbnailPath?: string;
}

interface SortableClipItemProps {
    clip: SelectedClip;
    index: number;
    onRemove: (id: string) => void;
    formatDuration: (seconds: number) => string;
}

/**
 * Sortable Clip Item Component
 * 
 * Displays a clip item that can be dragged and reordered
 */
export default function SortableClipItem({
    clip,
    index,
    onRemove,
    formatDuration,
}: SortableClipItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: clip.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`glass-card p-4 flex items-center gap-4 ${isDragging ? 'z-50' : ''}`}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-move text-dark-500 hover:text-dark-300 transition-colors"
                title="Drag to reorder"
            >
                <GripVertical className="w-5 h-5" />
            </div>
            <span className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 font-medium text-sm flex-shrink-0">
                {index + 1}
            </span>
            {clip.thumbnailPath && (
                <div className="w-20 h-12 rounded-lg overflow-hidden bg-dark-800 flex-shrink-0">
                    <img
                        src={clip.thumbnailPath}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm text-dark-200 truncate">
                    {clip.videoName || 'Unknown video'}
                </p>
                <p className="text-xs text-dark-400">
                    {formatDuration(clip.startTime)} - {formatDuration(clip.endTime)}
                </p>
            </div>
            <button
                onClick={() => onRemove(clip.id)}
                className="p-2 text-dark-400 hover:text-rose-400 transition-colors flex-shrink-0"
                title="Remove clip"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}
