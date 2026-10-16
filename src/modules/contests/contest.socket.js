export const registerContestHandlers = (io, socket) => {
    socket.on("join-contest", (contestId) => {
        if (contestId) socket.join(`contest_${contestId}`);
    });

    socket.on("leave-contest", (contestId) => {
        if (contestId) socket.leave(`contest_${contestId}`);
    });
};