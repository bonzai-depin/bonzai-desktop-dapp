# Flask executor for agentic workflow
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route("/execute", methods=["POST"])
def execute_workflow():
    payload = request.json
    steps = payload.get("steps", [])
    data_context = {}

    for step in steps:
        task = step["task"]
        endpoint = step["endpoint"]
        input_expr = step.get("input")

        if isinstance(input_expr, str):
            # Evaluate dotted input path (e.g. json.meals[0].description)
            value = resolve_input(data_context, input_expr)
        else:
            value = input_expr

        # POST request to local Flask endpoint
        response = requests.post(f"http://localhost:5000{endpoint}", json={"input": value})
        result = response.json()

        # Store result under step name
        data_context[task] = result

    return jsonify(data_context), 200

def resolve_input(ctx, path):
    parts = path.split('.')
    for part in parts:
        if part.endswith(']') and '[' in part:
            key, idx = part[:-1].split('[')
            ctx = ctx.get(key, [])[int(idx)]
        else:
            ctx = ctx.get(part)
    return ctx

if __name__ == '__main__':
    app.run(debug=True)
