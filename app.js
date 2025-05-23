const { useState, useEffect, useRef, useSyncExternalStore } = React;

const room = new WebsimSocket();

const CLICK_THRESHOLD = 50; // clicks needed before someone gets selected
const CANVAS_SIZE = 10000; // virtual canvas size

function App() {
    const [viewportX, setViewportX] = useState(0);
    const [viewportY, setViewportY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [totalClicks, setTotalClicks] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [clickEffects, setClickEffects] = useState([]);
    const canvasRef = useRef();

    // Subscribe to room data
    const buttons = useSyncExternalStore(
        room.collection('button').subscribe,
        room.collection('button').getList
    );

    const clicks = useSyncExternalStore(
        room.collection('click').subscribe,
        room.collection('click').getList
    );

    useEffect(() => {
        room.initialize();
        createInitialButtons();
    }, []);

    useEffect(() => {
        const clickCount = clicks.length;
        setTotalClicks(clickCount);
        
        // Check if we should generate a new button
        if (clickCount > 0 && clickCount % CLICK_THRESHOLD === 0) {
            selectRandomUserForGeneration();
        }
    }, [clicks.length]);

    const createInitialButtons = async () => {
        if (buttons.length === 0) {
            const initialButtons = [
                'red button',
                'blue circle',
                'green square',
                'yellow triangle',
                'purple star'
            ];

            for (const buttonText of initialButtons) {
                await generateButton(buttonText);
            }
        }
    };

    const generateButton = async (buttonText) => {
        try {
            const result = await websim.imageGen({
                prompt: `${buttonText} white background`,
                transparent: false,
                aspect_ratio: "1:1"
            });

            // Process to remove background
            const processedUrl = await removeBackground(result.url);
            
            await room.collection('button').create({
                imageUrl: processedUrl,
                text: buttonText,
                x: Math.random() * CANVAS_SIZE,
                y: Math.random() * CANVAS_SIZE
            });
        } catch (error) {
            console.error('Failed to generate button:', error);
        }
    };

    const removeBackground = async (imageUrl) => {
        // Create a canvas to process the image
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                // Remove white background (make transparent)
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    // If pixel is close to white, make it transparent
                    if (r > 240 && g > 240 && b > 240) {
                        data[i + 3] = 0; // alpha = 0 (transparent)
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = imageUrl;
        });
    };

    const selectRandomUserForGeneration = async () => {
        const currentUser = await window.websim.getCurrentUser();
        const allUsers = [...new Set(clicks.map(click => click.username))];
        
        if (allUsers.length === 0) return;
        
        const selectedUser = allUsers[Math.floor(Math.random() * allUsers.length)];
        
        if (selectedUser === currentUser.username) {
            setIsGenerating(true);
            
            const buttonPrompts = [
                'magic wand',
                'crystal gem',
                'golden coin',
                'silver key',
                'ancient scroll',
                'rainbow orb',
                'lightning bolt',
                'flower bloom',
                'diamond shape',
                'spiral shell'
            ];
            
            const randomPrompt = buttonPrompts[Math.floor(Math.random() * buttonPrompts.length)];
            await generateButton(randomPrompt);
            setIsGenerating(false);
        }
    };

    const handleMouseDown = (e) => {
        if (e.target === canvasRef.current) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - viewportX, y: e.clientY - viewportY });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setViewportX(e.clientX - dragStart.x);
            setViewportY(e.clientY - dragStart.y);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleButtonClick = async (e, button) => {
        e.stopPropagation();
        
        // Create click effect
        const rect = e.target.getBoundingClientRect();
        const effectId = Date.now();
        setClickEffects(prev => [...prev, {
            id: effectId,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        }]);

        // Remove effect after animation
        setTimeout(() => {
            setClickEffects(prev => prev.filter(effect => effect.id !== effectId));
        }, 600);

        // Record the click
        await room.collection('click').create({
            buttonId: button.id,
            timestamp: Date.now()
        });
    };

    const getVisibleButtons = () => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 200; // Load buttons slightly outside viewport
        
        return buttons.filter(button => {
            const buttonX = button.x - viewportX;
            const buttonY = button.y - viewportY;
            
            return buttonX > -margin && 
                   buttonX < viewportWidth + margin && 
                   buttonY > -margin && 
                   buttonY < viewportHeight + margin;
        });
    };

    return (
        <div 
            className="canvas" 
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div 
                className="viewport"
                style={{ transform: `translate(${viewportX}px, ${viewportY}px)` }}
            >
                {getVisibleButtons().map(button => (
                    <div
                        key={button.id}
                        className="button-container"
                        style={{
                            left: button.x,
                            top: button.y
                        }}
                    >
                        <button 
                            className="button"
                            onClick={(e) => handleButtonClick(e, button)}
                        >
                            <img src={button.imageUrl} alt={button.text} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="stats">
                <div>Total Clicks: {totalClicks}</div>
                <div>Buttons: {buttons.length}</div>
                <div>Next Button: {CLICK_THRESHOLD - (totalClicks % CLICK_THRESHOLD)} clicks</div>
            </div>

            {isGenerating && (
                <div className="generating">
                    Generating new button...
                </div>
            )}

            {clickEffects.map(effect => (
                <div
                    key={effect.id}
                    className="click-effect"
                    style={{
                        left: effect.x - 10,
                        top: effect.y - 10
                    }}
                />
            ))}
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById('root'));

