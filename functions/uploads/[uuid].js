export async function handle({ request, env }) {
    let image = new URL(request.url).pathname.replace('/uploads/', '').toLowerCase().trim();

    let Data;
    let DataMetadata = {};
    try {
        let r2 = await env.R2.get(image);
        Data = await r2.blob();

        DataMetadata.mime = r2.contentType;
    }
    catch(e) {
        Data = null
    }
    
    if (Data == null) {
        return new Response('Image not found. Please check and try again', {
            status: 404,
            headers: {
                'Content-Type': 'text/plain'
            }
        })
    }

    return new Response(Data, {
        headers: {
            'Content-Type': DataMetadata.mime
        }
    });
}

export async function onRequest({ request, env }) {
	return await handle({ request, env });
}