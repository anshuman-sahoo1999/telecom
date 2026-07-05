import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { RxCross2 } from "react-icons/rx";
import "../style/organogram.css";

const DraggableUser = ({ user, onDelete, onHover }) => {
    const loginUser = JSON.parse(localStorage.getItem("user"));

    const isAdmin = loginUser?.role === "Admin";

    // ✅ ONLY ADMIN CAN DRAG
    const canDrag = isAdmin;

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        isDragging,
    } = useDraggable({
        id: user.id.toString(),
        disabled: !canDrag,
    });

    const style = {
        transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : undefined,
        opacity: isDragging ? 0.6 : 1,
        cursor: canDrag ? "grab" : "default",
        touchAction: "none",
    };

    return (
        <div className="draggable-wrapper">
            <div
                ref={setNodeRef}
                className={`org-node ${
                    user.role === "TeamLead"
                        ? "tl"
                        : user.memberType === "QA"
                        ? "qa1"
                        : user.memberType === "QC"
                        ? "qc1"
                        : "prod1"
                }`}
                style={style}
                {...(canDrag ? listeners : {})}
                {...(canDrag ? attributes : {})}
                onPointerEnter={(e) => onHover?.(user, e)}
                onPointerLeave={() => onHover?.("LEAVE")}
            >
                <div className="drag-area">
                    {user.name}
                </div>

                {/* ✅ ONLY ADMIN CAN DELETE */}
                {isAdmin && (
                    <RxCross2
                        className="delete-icon"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete?.(user.id);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default DraggableUser;