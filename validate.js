const fs = require('fs');
const html = fs.readFileSync('src/public/index.html', 'utf8');

const getTagNames = (htmlStr) => {
    const tags = [];
    const openTagRegex = /<([a-zA-Z0-9\-]+)(?![^>]*\/>)[^>]*>/g;
    const closeTagRegex = /<\/([a-zA-Z0-9\-]+)>/g;
    const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', '!DOCTYPE'];

    const lines = htmlStr.split('\n');
    let stack = [];
    for (let i = 0; i < lines.length; i++) {
        let match;
        // Strip comments first to avoid parsing them
        let lineClean = lines[i].replace(/<!--[\s\S]*?-->/g, '');
        
        // Find all tags in this line. This is a bit naive but works for well-formatted HTML
        const tagRegex = /<\/?([a-zA-Z0-9\-]+)[^>]*>/g;
        while ((match = tagRegex.exec(lineClean)) !== null) {
            const fullTag = match[0];
            const tagName = match[1].toLowerCase();
            
            if (voidElements.includes(tagName)) continue;
            
            if (fullTag.startsWith('</')) {
                if (stack.length === 0) {
                    console.error(`Line ${i+1}: Found closing tag </${tagName}> but stack is empty!`);
                } else {
                    const last = stack.pop();
                    if (last.tag !== tagName) {
                        console.error(`Line ${i+1}: Mismatched closing tag. Expected </${last.tag}> (from line ${last.line}), got </${tagName}>`);
                        return; // return early to see the first error
                    }
                }
            } else if (!fullTag.endsWith('/>')) { // not self-closing
                stack.push({ tag: tagName, line: i + 1, content: fullTag });
                
                // If this is the schedule-modal, let's print the stack to see where we are!
                if(fullTag.includes('schedule-modal')) {
                    console.log(`\nFound Schedule Modal at line ${i+1}. Current stack depth: ${stack.length}`);
                    console.log('Stack path:', stack.map(s => s.tag).join(' > '));
                }
            }
        }
    }
    
    if (stack.length > 0) {
        console.error('Unclosed tags remain at EOF:');
        stack.forEach(s => console.log(` - <${s.tag}> from line ${s.line}`));
    } else {
        console.log('HTML tags validation passed! Depth is balanced.');
    }
}

getTagNames(html);
