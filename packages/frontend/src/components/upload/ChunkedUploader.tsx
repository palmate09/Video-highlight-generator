import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useUploadStore } from '@/store/uploadStore';
import { Upload, X, Check, AlertCircle, Film, Loader2 } from 'lucide-react';

const ACCEPTED_TYPES = {
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi'],
    'video/x-matroska': ['.mkv'],
};

export default function ChunkedUploader() {
    const { uploads, addUpload, cancelUpload, removeUpload } = useUploadStore();

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            acceptedFiles.forEach((file) => {
                addUpload(file);
            });
        },
        [addUpload]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: ACCEPTED_TYPES,
        maxSize: 2000 * 1024 * 1024, // 2GB
        multiple: true,
    });

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6">
            {/* Dropzone */}
            <div
                {...getRootProps()}
                className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer ${isDragActive
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-600 hover:border-dark-500 bg-dark-800/30'
                    }`}
            >
                <input {...getInputProps()} />
                <div className="p-12 text-center">
                    <div
                        className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 transition-all duration-300 ${isDragActive
                                ? 'bg-primary-500/20 scale-110'
                                : 'bg-dark-700'
                            }`}
                    >
                        <Upload
                            className={`w-8 h-8 transition-colors ${isDragActive ? 'text-primary-400' : 'text-dark-400'
                                }`}
                        />
                    </div>
                    <h3 className="text-lg font-semibold text-dark-100 mb-2">
                        {isDragActive ? 'Drop your videos here' : 'Upload Videos'}
                    </h3>
                    <p className="text-dark-400 mb-4">
                        Drag and drop video files, or{' '}
                        <span className="text-primary-400">browse</span>
                    </p>
                    <p className="text-xs text-dark-500">
                        Supports MP4, WebM, MOV, AVI, MKV • Max 2GB per file
                    </p>
                </div>

                {/* Decorative gradient */}
                {isDragActive && (
                    <div className="absolute inset-0 bg-gradient-radial from-primary-500/10 to-transparent pointer-events-none" />
                )}
            </div>

            {/* Upload list */}
            {uploads.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-dark-300">Uploads</h4>
                    {uploads.map((upload) => (
                        <div
                            key={upload.id}
                            className="glass-card p-4 animate-fade-in"
                        >
                            <div className="flex items-center gap-4">
                                {/* File icon */}
                                <div
                                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${upload.status === 'complete'
                                            ? 'bg-emerald-500/20'
                                            : upload.status === 'error'
                                                ? 'bg-rose-500/20'
                                                : 'bg-primary-500/20'
                                        }`}
                                >
                                    {upload.status === 'complete' ? (
                                        <Check className="w-6 h-6 text-emerald-400" />
                                    ) : upload.status === 'error' ? (
                                        <AlertCircle className="w-6 h-6 text-rose-400" />
                                    ) : upload.status === 'uploading' ? (
                                        <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                                    ) : (
                                        <Film className="w-6 h-6 text-primary-400" />
                                    )}
                                </div>

                                {/* File info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-dark-100 truncate">
                                        {upload.file.name}
                                    </p>
                                    <p className="text-xs text-dark-400">
                                        {formatFileSize(upload.file.size)}
                                        {upload.status === 'uploading' && ` • ${upload.progress}%`}
                                        {upload.status === 'complete' && ' • Complete'}
                                        {upload.status === 'error' && ` • ${upload.error}`}
                                    </p>

                                    {/* Progress bar */}
                                    {upload.status === 'uploading' && (
                                        <div className="mt-2 progress-bar">
                                            <div
                                                className="progress-bar-fill"
                                                style={{ width: `${upload.progress}%` }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <button
                                    onClick={() =>
                                        upload.status === 'uploading'
                                            ? cancelUpload(upload.id)
                                            : removeUpload(upload.id)
                                    }
                                    className="p-2 rounded-lg text-dark-400 hover:text-dark-200 hover:bg-dark-700 transition-colors"
                                    aria-label={upload.status === 'uploading' ? 'Cancel' : 'Remove'}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
